# Hosting MeetScribe

The app needs to launch a Chromium browser on the server when a user clicks
"Launch AI Bot." That bot then joins the Google Meet, asks to be admitted,
and records the meeting. Hosting must support **persistent processes** and
**at least 1 GB of RAM**.

## Option A — Run locally (free, easiest, perfect for demos)

```bash
cd frontend
npm install
npx playwright install chromium

# .env.local should contain:
#   GEMINI_API_KEY=...
#   CLERK_SECRET_KEY=...
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
#   BOT_HEADLESS=false   <-- watch the bot work in a real Chromium window!

npm run dev
```

Then open http://localhost:3000, sign in, and launch the bot. A Chromium
window will pop up on your machine, navigate to the Meet, and ask to join.
Click **Admit** in your real Meet tab to let it in.

## Option B — Fly.io (effectively free, cloud-hosted)

Fly.io's free monthly credit covers a single 1 GB VM running 24/7.

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
flyctl auth signup
flyctl launch --copy-config --no-deploy

flyctl secrets set GEMINI_API_KEY=xxx \
                    CLERK_SECRET_KEY=xxx \
                    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=xxx
flyctl deploy
```

Your URL will be `https://meet-scribe.fly.dev`.

## Option C — Render Starter ($7/mo)

Render's free tier (512 MB RAM) **cannot** launch Chromium — the process
gets OOM-killed. The Starter plan (2 GB RAM) works fine.

In the existing `CHI-SQUARE--2` service:
1. Settings → **Instance Type** → **Starter**
2. Save changes — Render rebuilds automatically

## Option D — Any VPS (DigitalOcean, Hetzner, Oracle Cloud Free Tier, etc.)

Anything with ≥1 GB RAM and Docker installed:

```bash
git clone https://github.com/saugata-malakar/CHI-SQUARE-.git
cd CHI-SQUARE-
docker build -t meet-scribe .
docker run -d \
  -p 80:10000 \
  -e GEMINI_API_KEY=xxx \
  -e CLERK_SECRET_KEY=xxx \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=xxx \
  meet-scribe
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | https://aistudio.google.com/app/apikey |
| `CLERK_SECRET_KEY` | yes | from Clerk dashboard |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | from Clerk dashboard |
| `BOT_HEADLESS` | no | `true` (default) for hosted; `false` for local-dev to see the bot window |
| `BOT_NAME` | no | name shown in the Meet participants list |
| `PUBLIC_ORIGIN` | no | only needed for split deploys |
