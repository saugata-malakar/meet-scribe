# 🚀 Meet-Scribe Deployment Guide

**Quick Deploy: Backend → Render | Frontend → Vercel**

---

## 📋 Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] Docker builds successfully locally
- [ ] Frontend builds successfully
- [ ] Git repository pushed to GitHub

---

## 🔧 Backend Deployment (Render)

### 1. Create Render Account & Connect Repository
- Go to [render.com](https://render.com)
- Sign up / Log in
- Click "New +" → "Web Service"
- Connect GitHub repository (`google-meet-scribe`)

### 2. Configure Backend Service
The `render.yaml` is pre-configured. Render will auto-detect it.
- **Name**: `meet-scribe-backend`
- **Branch**: `main` (or your default)
- **Root Directory**: `backend`
- **Runtime**: Docker

### 3. Set Required Environment Variables

Add these to Render dashboard (`Settings → Environment`):

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Supabase | PostgreSQL connection string |
| `CLERK_DOMAIN` | Clerk API | e.g., `app.clerk.accounts.dev` |
| `CLERK_SECRET_KEY` | Clerk API Keys | `sk_live_...` |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhooks | `whsec_...` |
| `GEMINI_API_KEY` | Google AI Studio | https://aistudio.google.com/app/apikey |
| `GOOGLE_CLOUD_PROJECT` | GCP Console | Your project ID |
| `GOOGLE_CREDENTIALS_JSON` | GCP Service Account | Base64-encoded JSON |
| `GCS_BUCKET_NAME` | Google Cloud Storage | Default: `meet-scribe-storage` |
| `UPSTASH_REDIS_URL` | Upstash Console | REST API URL |
| `UPSTASH_REDIS_TOKEN` | Upstash Console | REST API token |
| `PINECONE_API_KEY` | Pinecone Dashboard | API key |
| `SENTRY_DSN` | Sentry Project | Error tracking DSN |

**Base64 encode Google credentials:**
```bash
# macOS/Linux
base64 -w 0 service-account.json

# Windows (PowerShell)
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("service-account.json"))
```

### 4. Deploy
- Set health check path to `/health`
- Click "Deploy"
- Wait for build to complete (~5-10 min)
- Copy backend URL: `https://meet-scribe-backend.onrender.com`

---

## 🎨 Frontend Deployment (Vercel)

### 1. Create Vercel Account & Import Project
- Go to [vercel.com](https://vercel.com)
- Click "Add New +" → "Project"
- Import GitHub repository
- Vercel auto-detects Next.js

### 2. Configure Project Settings
- **Framework**: Next.js (auto-detected)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build` (auto-detected)
- **Install Command**: `npm install` (auto-detected)

### 3. Set Environment Variables

In Vercel dashboard (`Settings → Environment Variables`), add:

| Variable | Value | Type |
|----------|-------|------|
| `NEXT_PUBLIC_API_URL` | `https://meet-scribe-backend.onrender.com` | Public |
| `NEXT_PUBLIC_WS_URL` | `wss://meet-scribe-backend.onrender.com` | Public |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk API Keys | Public |
| `CLERK_SECRET_KEY` | From Clerk API Keys | Private |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` | Public |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/signup` | Public |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` | Public |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` | Public |
| `NEXT_PUBLIC_POSTHOG_KEY` | From PostHog (optional) | Public |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://app.posthog.com` | Public |
| `NEXT_PUBLIC_SENTRY_DSN` | From Sentry (optional) | Public |
| `SENTRY_AUTH_TOKEN` | From Sentry (optional) | Private |

### 4. Deploy
- Click "Deploy"
- Wait for build (~3-5 min)
- Frontend URL: `https://meet-scribe.vercel.app` (or custom domain)

---

## 🔐 Getting Required Credentials

### Supabase (PostgreSQL)
1. Create project at [supabase.com](https://supabase.com)
2. Go to `Settings → Database → Connection Strings (URI)`
3. Copy connection string

### Clerk (Auth)
1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create application
3. Copy keys from `API Keys` section
4. Set webhook at `Webhooks` → `Render backend URL + /webhooks/clerk`

### Google Cloud (Speech-to-Text, GCS, Gemini)
1. Create project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable APIs: Cloud Speech, Cloud Storage, Generative AI
3. Create service account with Editor role
4. Download JSON key → Base64 encode for `GOOGLE_CREDENTIALS_JSON`
5. Create storage bucket for `GCS_BUCKET_NAME`
6. Get Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

### Upstash Redis
1. Create database at [console.upstash.com](https://console.upstash.com)
2. Go to `REST API` tab
3. Copy URL and token

### Pinecone
1. Go to [app.pinecone.io](https://app.pinecone.io)
2. Create index (dimension: 768 for embeddings)
3. Copy API key from `API Keys`

### Sentry (Optional - Error Tracking)
1. Create project at [sentry.io](https://sentry.io)
2. Copy DSN from `Client Keys (DSN)`

---

## ✅ Verification

After deployment, test:

**Backend**
```bash
curl https://meet-scribe-backend.onrender.com/health
# Should return 200 OK
```

**Frontend**
```bash
# Visit https://meet-scribe.vercel.app
# Should load login page with Clerk auth
```

---

## 🐛 Troubleshooting

### Backend won't build
- Check Docker build locally: `docker build -f backend/Dockerfile .`
- Verify all system dependencies in Dockerfile
- Check Render logs for build errors

### Frontend env vars not loading
- Ensure variables are prefixed with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding env vars (they don't auto-reload)
- Check `.env.local` is NOT committed to git

### Backend returning 502
- Check backend started successfully in Render logs
- Verify all required env vars are set
- Check Sentry for errors if configured

### CORS errors
- Verify `FRONTEND_URL` in render.yaml matches deployed URL
- Check Clerk webhook is configured

---

## 📦 Environment File Examples

**Backend (.env)** — Safe to commit as `.env.example` ✓
**Frontend (.env.local)** — Should stay local only ✗

Always use platform-specific secret management:
- **Render**: Dashboard environment variables
- **Vercel**: Environment variables in project settings

---

## 🎯 Post-Deployment

1. **Set up custom domains** (optional)
   - Render: `Settings → Custom Domains`
   - Vercel: `Settings → Domains`

2. **Enable analytics**
   - Sentry: Auto-configured
   - PostHog: Optional event tracking

3. **Monitor health**
   - Render: Auto-restarts on failure
   - Vercel: Auto-scaling included

---

## 📞 Quick Links

- Render Dashboard: https://dashboard.render.com
- Vercel Dashboard: https://vercel.com/dashboard
- Backend URL: https://meet-scribe-backend.onrender.com
- Frontend URL: https://meet-scribe.vercel.app
