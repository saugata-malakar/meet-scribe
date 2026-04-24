from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import re

from app.database import get_db
from app.models.session import MeetSession, SessionStatus, TranscriptChunk
from app.models.user import User
from app.utils.clerk_auth import get_current_user
from app.services.summarization_service import generate_summary
from app.services.session_config import SessionConfig, load as load_session_config

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ManualTranscriptRequest(BaseModel):
    text: str


class SessionCreateRequest(BaseModel):
    meet_url: str
    title: Optional[str] = None

    def validate_meet_url(self):
        pattern = r"https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}"
        if not re.match(pattern, self.meet_url):
            # Also accept other Meet URL formats
            if "meet.google.com" not in self.meet_url:
                raise ValueError("Must be a valid Google Meet URL")
        return self.meet_url


class ChunkResponse(BaseModel):
    id: str
    sequence: int
    text: str
    speaker: Optional[str]
    start_time_ms: Optional[int]
    end_time_ms: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    meet_url: str
    title: Optional[str]
    status: str
    bot_joined_at: Optional[datetime]
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    summary: Optional[str]
    full_transcript: Optional[str]
    action_items: Optional[list]
    key_points: Optional[list]
    participants: Optional[list]
    sentiment: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionListItem(BaseModel):
    id: str
    meet_url: str
    title: Optional[str]
    status: str
    duration_seconds: Optional[int]
    summary: Optional[str]
    sentiment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = MeetSession(
        user_id=current_user.id,
        meet_url=body.meet_url,
        title=body.title,
        status=SessionStatus.pending,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse.model_validate(session)


@router.get("", response_model=List[SessionListItem])
async def list_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    query = (
        select(MeetSession)
        .where(MeetSession.user_id == current_user.id)
        .order_by(desc(MeetSession.created_at))
        .offset(offset)
        .limit(limit)
    )
    if status:
        query = query.where(MeetSession.status == status)

    result = await db.execute(query)
    sessions = result.scalars().all()
    return [SessionListItem.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse.model_validate(session)


@router.get("/{session_id}/chunks", response_model=List[ChunkResponse])
async def get_session_chunks(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    sess_result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(TranscriptChunk)
        .where(TranscriptChunk.session_id == session_id)
        .order_by(TranscriptChunk.sequence)
    )
    chunks = result.scalars().all()
    return [ChunkResponse.model_validate(c) for c in chunks]


@router.post("/{session_id}/transcript", response_model=SessionResponse)
async def submit_manual_transcript(
    session_id: str,
    body: ManualTranscriptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a manually pasted transcript for a session and generate a summary."""
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty")

    # Save the transcript
    session.full_transcript = body.text.strip()
    session.status = SessionStatus.processing
    await db.commit()

    # Generate summary using Gemini, honoring any saved per-session config.
    try:
        cfg = load_session_config(str(session.id))
        summary_data = await generate_summary(session.full_transcript, config=cfg)
        if summary_data:
            session.summary = summary_data.get("summary", "")
            session.action_items = summary_data.get("action_items", [])
            session.key_points = summary_data.get("key_points", [])
            session.participants = summary_data.get("participants", [])
            session.sentiment = summary_data.get("sentiment", "neutral")
            if summary_data.get("title") and not session.title:
                session.title = summary_data["title"]
    except Exception as e:
        print(f"Summary generation failed: {e}")
        session.summary = "Summary generation failed. Transcript saved successfully."

    session.status = SessionStatus.completed
    await db.commit()
    await db.refresh(session)
    return SessionResponse.model_validate(session)


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()


@router.get("/stats/summary")
async def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await db.execute(
        select(func.count(MeetSession.id)).where(MeetSession.user_id == current_user.id)
    )
    completed = await db.execute(
        select(func.count(MeetSession.id)).where(
            MeetSession.user_id == current_user.id,
            MeetSession.status == SessionStatus.completed,
        )
    )
    total_duration = await db.execute(
        select(func.sum(MeetSession.duration_seconds)).where(
            MeetSession.user_id == current_user.id,
            MeetSession.status == SessionStatus.completed,
        )
    )
    return {
        "total_sessions": total.scalar() or 0,
        "completed_sessions": completed.scalar() or 0,
        "total_minutes_recorded": int((total_duration.scalar() or 0) / 60),
    }
