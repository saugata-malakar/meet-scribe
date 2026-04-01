"""
Auth router — Clerk webhook handler.

Clerk handles all sign-up / sign-in flows on the frontend.
This webhook keeps our Supabase users table in sync with Clerk.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime, timezone
import json
import svix
from svix.webhooks import Webhook

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.utils.clerk_auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ─── Clerk webhook ────────────────────────────────────────────────────────────

@router.post("/webhook/clerk")
async def clerk_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None, alias="svix-id"),
    svix_timestamp: Optional[str] = Header(None, alias="svix-timestamp"),
    svix_signature: Optional[str] = Header(None, alias="svix-signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Receives Clerk webhook events and syncs user data to Supabase.
    Configure in Clerk Dashboard → Webhooks → add endpoint:
      https://your-backend.onrender.com/api/auth/webhook/clerk
    Events to enable: user.created, user.updated, user.deleted
    """
    if not settings.CLERK_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook secret not configured")

    body = await request.body()

    # Verify Svix signature
    try:
        wh = Webhook(settings.CLERK_WEBHOOK_SECRET)
        evt = wh.verify(
            body,
            {
                "svix-id": svix_id or "",
                "svix-timestamp": svix_timestamp or "",
                "svix-signature": svix_signature or "",
            },
        )
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")

    event_type = evt.get("type")
    data = evt.get("data", {})

    clerk_id = data.get("id")
    if not clerk_id:
        return {"status": "ignored"}

    email = ""
    for ea in data.get("email_addresses", []):
        if ea.get("id") == data.get("primary_email_address_id"):
            email = ea.get("email_address", "")
            break

    first = data.get("first_name") or ""
    last = data.get("last_name") or ""
    name = f"{first} {last}".strip() or email.split("@")[0]
    avatar = data.get("image_url") or data.get("profile_image_url")

    if event_type == "user.created":
        existing = await db.execute(select(User).where(User.clerk_id == clerk_id))
        if not existing.scalar_one_or_none():
            user = User(
                clerk_id=clerk_id,
                email=email.lower(),
                name=name,
                role=UserRole.user,
                is_active=True,
                avatar_url=avatar,
            )
            db.add(user)
            await db.commit()

    elif event_type == "user.updated":
        result = await db.execute(select(User).where(User.clerk_id == clerk_id))
        user = result.scalar_one_or_none()
        if user:
            user.email = email.lower() or user.email
            user.name = name or user.name
            user.avatar_url = avatar or user.avatar_url
            user.updated_at = datetime.now(timezone.utc)
            await db.commit()

    elif event_type == "user.deleted":
        result = await db.execute(select(User).where(User.clerk_id == clerk_id))
        user = result.scalar_one_or_none()
        if user:
            user.is_active = False
            await db.commit()

    return {"status": "ok"}


# ─── /me endpoint ─────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "clerk_id": current_user.clerk_id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role.value,
        "is_active": current_user.is_active,
        "avatar_url": current_user.avatar_url,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }
