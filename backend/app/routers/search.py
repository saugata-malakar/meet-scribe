from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models.session import MeetSession, SessionStatus
from app.models.user import User
from app.utils.clerk_auth import get_current_user
from app.services import pinecone_service

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchResult(BaseModel):
    session_id: str
    title: str
    summary: str
    score: float
    topics: List[str]
    sentiment: str
    created_at: str


@router.get("", response_model=List[SearchResult])
async def semantic_search(
    q: str = Query(..., min_length=2, max_length=500, description="Natural language search query"),
    limit: int = Query(10, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Semantic search over your meeting summaries using Pinecone vector search.
    Example queries:
      - "find meetings about the Q3 budget"
      - "engineering sprint planning"
      - "action items for the sales team"
    """
    results = pinecone_service.search_sessions(
        user_id=str(current_user.id),
        query=q,
        top_k=limit,
    )

    if not results:
        return []

    # Enrich with live DB data (to get current title if updated)
    session_ids = [r["session_id"] for r in results]
    db_sessions_result = await db.execute(
        select(MeetSession).where(
            MeetSession.id.in_(session_ids),
            MeetSession.user_id == current_user.id,
            MeetSession.status == SessionStatus.completed,
        )
    )
    db_sessions = {str(s.id): s for s in db_sessions_result.scalars().all()}

    enriched = []
    for r in results:
        sid = r["session_id"]
        db_s = db_sessions.get(sid)
        enriched.append(
            SearchResult(
                session_id=sid,
                title=db_s.title if db_s and db_s.title else r.get("title", "Untitled"),
                summary=db_s.summary[:300] if db_s and db_s.summary else r.get("summary", ""),
                score=r["score"],
                topics=r.get("topics", []),
                sentiment=r.get("sentiment", "neutral"),
                created_at=r.get("created_at", ""),
            )
        )

    return enriched
