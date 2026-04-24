# Single-process Next.js deploy. The backend is now implemented as Next.js
# route handlers under /api/*, so the whole app runs in one Node process
# with no nginx, no Python, no multi-service juggling. Runtime env vars
# (GEMINI_API_KEY, CLERK_SECRET_KEY) are set on the Render service.
FROM node:20-slim

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps

COPY frontend/ .

# Ensure Next.js' optional folders exist so the build never fails on a thin
# source tree (e.g. missing public/).
RUN mkdir -p public src/app src/components src/lib src/styles

# Public env vars baked at build time. Clerk publishable key is safe to be
# public. API / WS URLs are empty — the app uses relative paths to hit its
# own /api/* routes on the same origin.
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_WS_URL=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3VpZGluZy1nb2xkZmlzaC0zNy5jbGVyay5hY2NvdW50cy5kZXYk
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

RUN npm run build

# Render sets PORT (typically 10000). Bind Next.js to it.
ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-10000}"]
