from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.redis_service import get_redis
import time


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global IP-based rate limiting: 200 requests/minute per IP.
    Stricter limits on specific routes handled in routers via redis_service.
    """

    LIMIT = 200
    WINDOW = 60  # seconds
    EXEMPT_PATHS = {"/health", "/", "/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        key = f"global_rl:{ip}"
        now = int(time.time())
        window_start = now - self.WINDOW

        try:
            redis = get_redis()
            redis.zremrangebyscore(key, 0, window_start)
            count = redis.zcard(key)

            if count >= self.LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please slow down.",
                    headers={"Retry-After": str(self.WINDOW)},
                )

            redis.zadd(key, {str(now): now})
            redis.expire(key, self.WINDOW)
        except HTTPException:
            raise
        except Exception:
            # If Redis is down, don't block requests
            pass

        return await call_next(request)
