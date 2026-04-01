"""
Upstash Redis service using the upstash-redis HTTP client.
Used for: rate limiting bot launches, caching stats, storing live bot state.
"""
import json
import time
from typing import Any, Optional
from upstash_redis import Redis as UpstashRedis

from app.config import settings

_client: Optional[UpstashRedis] = None


def get_redis() -> UpstashRedis:
    global _client
    if _client is None:
        _client = UpstashRedis(
            url=settings.UPSTASH_REDIS_URL,
            token=settings.UPSTASH_REDIS_TOKEN,
        )
    return _client


# ─── Rate limiting ────────────────────────────────────────────────────────────

def check_rate_limit(user_id: str, action: str, limit: int, window_seconds: int) -> bool:
    """
    Sliding window rate limit.
    Returns True if the action is allowed, False if rate-limited.
    """
    redis = get_redis()
    key = f"rl:{action}:{user_id}"
    now = int(time.time())
    window_start = now - window_seconds

    # Remove old entries
    redis.zremrangebyscore(key, 0, window_start)

    # Count current entries
    count = redis.zcard(key)
    if count >= limit:
        return False

    # Add new entry
    redis.zadd(key, {str(now): now})
    redis.expire(key, window_seconds)
    return True


def bot_launch_allowed(user_id: str) -> bool:
    """Allow max 3 bot launches per user per hour."""
    return check_rate_limit(user_id, "bot_launch", limit=3, window_seconds=3600)


# ─── Session status cache ─────────────────────────────────────────────────────

def cache_session_status(session_id: str, status: str, extra: dict = None) -> None:
    redis = get_redis()
    payload = {"status": status, **(extra or {})}
    redis.setex(f"session_status:{session_id}", 300, json.dumps(payload))


def get_cached_session_status(session_id: str) -> Optional[dict]:
    redis = get_redis()
    raw = redis.get(f"session_status:{session_id}")
    if raw:
        return json.loads(raw)
    return None


# ─── Stats cache ──────────────────────────────────────────────────────────────

def cache_user_stats(user_id: str, stats: dict, ttl: int = 60) -> None:
    redis = get_redis()
    redis.setex(f"stats:{user_id}", ttl, json.dumps(stats))


def get_cached_user_stats(user_id: str) -> Optional[dict]:
    redis = get_redis()
    raw = redis.get(f"stats:{user_id}")
    return json.loads(raw) if raw else None


def invalidate_user_stats(user_id: str) -> None:
    redis = get_redis()
    redis.delete(f"stats:{user_id}")


# ─── Admin stats cache ────────────────────────────────────────────────────────

def cache_admin_stats(stats: dict, ttl: int = 30) -> None:
    redis = get_redis()
    redis.setex("admin_stats", ttl, json.dumps(stats))


def get_cached_admin_stats() -> Optional[dict]:
    redis = get_redis()
    raw = redis.get("admin_stats")
    return json.loads(raw) if raw else None


# ─── Generic helpers ──────────────────────────────────────────────────────────

def set_key(key: str, value: Any, ttl: int = 300) -> None:
    redis = get_redis()
    redis.setex(key, ttl, json.dumps(value) if not isinstance(value, str) else value)


def get_key(key: str) -> Optional[str]:
    redis = get_redis()
    return redis.get(key)


def delete_key(key: str) -> None:
    redis = get_redis()
    redis.delete(key)
