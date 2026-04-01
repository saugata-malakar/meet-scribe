"""
Clerk JWT verification for FastAPI.
Fetches Clerk's JWKS and verifies RS256 tokens on every request.
The JWKS is cached in memory for 1 hour to avoid hammering Clerk's endpoint.
"""
import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

security = HTTPBearer(auto_error=False)

# In-memory JWKS cache
_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


async def _get_jwks() -> list:
    """Return cached JWKS, refreshing if older than 1 hour."""
    now = time.time()
    if now - _jwks_cache["fetched_at"] < 3600 and _jwks_cache["keys"]:
        return _jwks_cache["keys"]

    url = f"https://{settings.CLERK_DOMAIN}/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    _jwks_cache["keys"] = data.get("keys", [])
    _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


async def _verify_token(token: str) -> dict:
    """Decode and verify a Clerk-issued JWT. Returns the payload."""
    try:
        header = jose_jwt.get_unverified_header(token)
        kid = header.get("kid")

        keys = await _get_jwks()
        signing_key = next((k for k in keys if k.get("kid") == kid), None)

        if signing_key is None:
            # Retry once with fresh JWKS (key rotation)
            _jwks_cache["fetched_at"] = 0
            keys = await _get_jwks()
            signing_key = next((k for k in keys if k.get("kid") == kid), None)

        if signing_key is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signing key not found")

        payload = jose_jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return payload

    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Token invalid: {exc}") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Auth error: {exc}") from exc


async def _get_or_create_user(db: AsyncSession, clerk_id: str, email: str, name: str) -> User:
    """Fetch user by Clerk ID, creating a new row if first login."""
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    user = User(
        clerk_id=clerk_id,
        email=email.lower(),
        name=name or email.split("@")[0],
        role=UserRole.user,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Main auth dependency: validates Clerk JWT and returns the DB user."""
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")

    payload = await _verify_token(credentials.credentials)

    clerk_id: str = payload.get("sub", "")
    if not clerk_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token claims")

    # Extract email/name from Clerk payload (present in session tokens)
    email: str = (
        payload.get("email")
        or (payload.get("email_addresses") or [{}])[0].get("email_address", "")
        or f"{clerk_id}@clerk.internal"
    )
    name: str = (
        f"{payload.get('first_name', '')} {payload.get('last_name', '')}".strip()
        or email.split("@")[0]
    )

    user = await _get_or_create_user(db, clerk_id, email, name)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")

    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require admin role."""
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
