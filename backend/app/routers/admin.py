from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.user import User, UserRole
from app.models.session import MeetSession, SessionStatus
from app.utils.clerk_auth import require_admin
from app.services import bot_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserAdminResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    session_count: int = 0

    class Config:
        from_attributes = True


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/stats")
async def get_system_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get overall system statistics."""
    total_users = await db.execute(select(func.count(User.id)))
    total_sessions = await db.execute(select(func.count(MeetSession.id)))
    completed_sessions = await db.execute(
        select(func.count(MeetSession.id)).where(MeetSession.status == SessionStatus.completed)
    )
    active_sessions = await db.execute(
        select(func.count(MeetSession.id)).where(
            MeetSession.status.in_([SessionStatus.joining, SessionStatus.recording])
        )
    )
    total_duration = await db.execute(
        select(func.sum(MeetSession.duration_seconds)).where(
            MeetSession.status == SessionStatus.completed
        )
    )

    return {
        "total_users": total_users.scalar() or 0,
        "total_sessions": total_sessions.scalar() or 0,
        "completed_sessions": completed_sessions.scalar() or 0,
        "active_bots": len(bot_service.get_active_sessions()),
        "active_sessions_db": active_sessions.scalar() or 0,
        "total_minutes_recorded": int((total_duration.scalar() or 0) / 60),
    }


@router.get("/users", response_model=List[UserAdminResponse])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    query = select(User).order_by(desc(User.created_at)).offset(offset).limit(limit)
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )

    result = await db.execute(query)
    users = result.scalars().all()

    # Get session counts
    responses = []
    for user in users:
        count_result = await db.execute(
            select(func.count(MeetSession.id)).where(MeetSession.user_id == user.id)
        )
        responses.append(
            UserAdminResponse(
                id=str(user.id),
                email=user.email,
                name=user.name,
                role=user.role.value,
                is_active=user.is_active,
                created_at=user.created_at,
                last_login=user.last_login,
                session_count=count_result.scalar() or 0,
            )
        )
    return responses


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot modify your own account via admin panel")

    if body.role is not None:
        try:
            user.role = UserRole(body.role)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()
    return {"message": "User updated successfully"}


@router.get("/sessions")
async def list_all_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all sessions across all users (admin only)."""
    offset = (page - 1) * limit
    query = (
        select(MeetSession)
        .order_by(desc(MeetSession.created_at))
        .offset(offset)
        .limit(limit)
    )
    if status:
        query = query.where(MeetSession.status == status)

    result = await db.execute(query)
    sessions = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "user_id": str(s.user_id),
            "meet_url": s.meet_url,
            "title": s.title,
            "status": s.status.value,
            "duration_seconds": s.duration_seconds,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def admin_delete_session(
    session_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MeetSession).where(MeetSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
