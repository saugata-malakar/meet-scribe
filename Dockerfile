# Single-process Next.js + Playwright/Chromium image.
#
# The Next.js app runs the entire backend (API routes), and at /api/bot/launch
# it spawns a Playwright Chromium that joins the Google Meet as a guest.
# That Chromium is what shows up in the meeting and captures audio.
#
# Memory note: Chromium needs ~700MB-1GB at runtime to join a Meet without
# OOM-crashing. Render's free tier (512MB) IS NOT ENOUGH — the Chromium
# launch will fail. Use one of:
#   - Render Starter plan ($7/mo, 512MB→2GB)
#   - Fly.io free tier (1GB shared, see fly.toml)
#   - Local: just run `npm run dev` in frontend/, the bot opens a window on
#     your machine and joins the call from there. Free + works perfectly.
FROM node:20-bookworm-slim

# Playwright's Chromium needs a bunch of system libs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Tailscale for bypass
RUN curl -fsSL https://tailscale.com/install.sh | sh


WORKDIR /app

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps

# Install Playwright's Chromium binary into the image.
RUN npx playwright install chromium

COPY frontend/ .

# Ensure Next.js' optional folders exist so the build never fails on a thin
# source tree.
RUN mkdir -p public src/app src/components src/lib src/styles

# Public env vars baked at build time. API URL is empty — the app uses
# relative paths to hit its own /api/* routes on the same origin.
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_WS_URL=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3VpZGluZy1nb2xkZmlzaC0zNy5jbGVyay5hY2NvdW50cy5kZXYk
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Bot defaults — override via env on the host.
ENV BOT_NAME="AI Scribe Bot"
ENV BOT_HEADLESS="true"

RUN npm run build

ENV PORT=10000
EXPOSE 10000

COPY start.sh .
RUN chmod +x start.sh

# Start Xvfb on display :99 and run Next under it. Headless Chromium can
# work without Xvfb but Meet sometimes refuses headless UAs; running with
# Xvfb gives us a real display we can fall back to a non-headless launch on.
CMD ["./start.sh"]

