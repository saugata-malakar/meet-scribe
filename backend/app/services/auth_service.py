from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Optional
import bcrypt

from app.models.user import User, UserRole
from app.utils.jwt_utils import create_access_token, create_refresh_token, verify_token


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
    role: UserRole = UserRole.user,
) -> User:
    user = User(
        email=email.lower().strip(),
        name=name.strip(),
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        is_verified=True,  # Skip email verification for simplicity
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    user = await get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    return user


def generate_tokens(user: User) -> dict:
    token_data = {"sub": str(user.id), "email": user.email, "role": user.role.value}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
    }


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> Optional[dict]:
    payload = verify_token(refresh_token, token_type="refresh")
    if not payload:
        return None
    user = await get_user_by_id(db, payload.get("sub"))
    if not user or not user.is_active:
        return None
    return generate_tokens(user)
