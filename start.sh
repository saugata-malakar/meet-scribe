#!/bin/sh
# Launches backend + frontend + nginx. Any one dying takes the container down
# so Render notices and restarts us.
set -e

cleanup() {
    echo "[start] shutting down..."
    kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[start] starting backend on :${BACKEND_PORT:-8000}"
(
    cd /app/backend
    exec uvicorn app.main:app \
        --host 127.0.0.1 \
        --port "${BACKEND_PORT:-8000}" \
        --workers 1 \
        --proxy-headers \
        --forwarded-allow-ips="*"
) &
BACKEND_PID=$!

echo "[start] starting frontend on :${FRONTEND_PORT:-3000}"
(
    cd /app/frontend
    exec npx next start -H 127.0.0.1 -p "${FRONTEND_PORT:-3000}"
) &
FRONTEND_PID=$!

# Give the upstream services a moment before nginx starts hammering them.
sleep 3

echo "[start] starting nginx on :${PORT:-10000}"
exec nginx -g 'daemon off;'
