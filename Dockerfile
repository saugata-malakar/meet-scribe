# ─── Combined image: FastAPI backend + Next.js frontend behind nginx ──────────
#
# Render free-tier only lets us deploy one web service per repo conveniently,
# and the frontend needs to talk to the backend. Instead of juggling two URLs
# (and getting NEXT_PUBLIC_API_URL wrong), we run both inside one container
# and expose a single port. Nginx routes:
#
#   /api/*   → backend :8000
#   /ws/*    → backend :8000  (websocket upgrades)
#   /health  → backend :8000
#   /docs    → backend :8000
#   everything else → Next.js :3000
#
# The frontend uses RELATIVE URLs (same-origin fetch), so there is no
# NEXT_PUBLIC_API_URL to get wrong.
# ──────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: build the Next.js frontend ────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /fe

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps

COPY frontend/ .

# Pre-create every directory Next.js treats as optional but that the runtime
# stage unconditionally copies. If any of these are missing in the source
# tree, the build would fail with "not found" — this makes the image tolerant
# of a thin source tree.
RUN mkdir -p public src/app src/components src/lib src/styles

# Public env vars baked at build time. API / WS URLs intentionally empty so
# the frontend uses relative paths (same origin as nginx). Clerk key is public.
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_WS_URL=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3VpZGluZy1nb2xkZmlzaC0zNy5jbGVyay5hY2NvdW50cy5kZXYk
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

RUN npm run build

# ─── Stage 2: runtime — Python + Node + nginx in one image ────────────────────
FROM python:3.12-slim AS runtime

# Install nginx + Node.js runtime (for `next start`) + curl.
# We intentionally skip Playwright / Xvfb / PulseAudio because BOT_MODE=browser
# captures audio in the user's real browser; we don't need a server-side
# Chromium. That cuts the image size by several hundred MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ─── Backend ──
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# ─── Frontend (already built) ──
# Copy the entire build output in one shot. This is more robust than
# cherry-picking individual files — any optional file/folder that's absent
# in the source tree simply doesn't appear here, instead of erroring.
WORKDIR /app
COPY --from=frontend-build /fe /app/frontend

# ─── Nginx config + launcher ──
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Render maps the container port via $PORT (usually 10000). Nginx listens
# there; backend stays on 8000 and frontend on 3000 internally.
ENV PORT=10000
ENV BACKEND_PORT=8000
ENV FRONTEND_PORT=3000
EXPOSE 10000

WORKDIR /app
CMD ["/app/start.sh"]
