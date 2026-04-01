import base64
import asyncio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db, AsyncSessionLocal
from app.models.session import MeetSession, SessionStatus
from app.models.user import User
from app.utils.clerk_auth import get_current_user
from app.services import bot_service
from app.utils.jwt_utils import verify_token

router = APIRouter(prefix="/api/bot", tags=["bot"])


class LaunchBotRequest(BaseModel):
    session_id: str


class StopBotRequest(BaseModel):
    session_id: str


class AudioChunkRequest(BaseModel):
    session_id: str
    sequence: int
    audio_base64: str
    mime_type: str = "audio/webm;codecs=opus"


@router.post("/launch")
async def launch_bot(
    body: LaunchBotRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Launch a bot to join a Google Meet."""
    # Verify session belongs to user
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == body.session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in (SessionStatus.pending, SessionStatus.failed):
        raise HTTPException(status_code=400, detail=f"Session is already {session.status}")

    try:
        await bot_service.launch_bot(
            session_id=str(session.id),
            meet_url=session.meet_url,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))

    return {"message": "Bot launched successfully", "session_id": str(session.id)}


@router.post("/stop")
async def stop_bot(
    body: StopBotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop an active bot."""
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == body.session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    stopped = await bot_service.stop_bot(str(session.id), db)
    if not stopped:
        # Bot may have already stopped; just mark as stopped
        session.status = SessionStatus.stopped
        await db.commit()

    return {"message": "Bot stopped", "session_id": str(session.id)}


@router.post("/chunk")
async def receive_audio_chunk(
    body: AudioChunkRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive audio chunk from the Playwright bot's injected JS.
    This endpoint is called internally by the bot, no auth needed (internal network).
    """
    try:
        audio_bytes = base64.b64decode(body.audio_base64)
        text = await bot_service.process_audio_chunk(
            db=db,
            session_id=body.session_id,
            sequence=body.sequence,
            audio_bytes=audio_bytes,
            mime_type=body.mime_type,
        )
        return {"status": "ok", "text": text, "sequence": body.sequence}
    except Exception as e:
        # Don't fail loudly - bot should continue even if one chunk fails
        return {"status": "error", "error": str(e), "sequence": body.sequence}


@router.get("/active")
async def get_active_bots(current_user: User = Depends(get_current_user)):
    """Get list of currently active bot sessions (admin or own)."""
    active = bot_service.get_active_sessions()
    return {"active_sessions": active, "count": len(active)}


@router.websocket("/ws/{session_id}")
async def websocket_status(websocket: WebSocket, session_id: str):
    """
    WebSocket for real-time session status updates.
    Client sends token as first message for auth.
    """
    await websocket.accept()

    # Auth via first message
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        payload = verify_token(auth_msg, "access")
        if not payload:
            await websocket.send_json({"error": "Unauthorized"})
            await websocket.close(code=4001)
            return
    except asyncio.TimeoutError:
        await websocket.close(code=4002)
        return

    user_id = payload.get("sub")

    try:
        while True:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MeetSession).where(
                        MeetSession.id == session_id,
                    )
                )
                session = result.scalar_one_or_none()

                if not session or str(session.user_id) != user_id:
                    await websocket.send_json({"error": "Not found"})
                    break

                # Count chunks so far
                from sqlalchemy import func
                from app.models.session import TranscriptChunk
                chunk_count_result = await db.execute(
                    select(func.count(TranscriptChunk.id)).where(
                        TranscriptChunk.session_id == session_id
                    )
                )
                chunk_count = chunk_count_result.scalar() or 0

                await websocket.send_json({
                    "session_id": session_id,
                    "status": session.status.value,
                    "chunk_count": chunk_count,
                    "title": session.title,
                    "summary": session.summary,
                    "sentiment": session.sentiment,
                })

                if session.status in (
                    SessionStatus.completed,
                    SessionStatus.failed,
                    SessionStatus.stopped,
                ):
                    break

            await asyncio.sleep(3)

    except WebSocketDisconnect:
        pass
