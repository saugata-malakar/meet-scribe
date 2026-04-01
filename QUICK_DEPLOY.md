# ⚡ DEPLOYMENT QUICK START

## 🟢 STEP 1: Create Render Account & Deploy Backend
```
1. Go to render.com → Sign up
2. Click "New +" → "Web Service"
3. Connect GitHub (google-meet-scribe repo)
4. Render auto-detects render.yaml
5. Add environment variables (see DEPLOYMENT.md table)
6. Click Deploy → Wait 5-10 min
7. Copy backend URL
```

**Backend URL Format**: `https://meet-scribe-backend.onrender.com`

---

## 🟢 STEP 2: Create Vercel Account & Deploy Frontend
```
1. Go to vercel.com → Sign up
2. Click "Add New +" → "Project"
3. Import GitHub (google-meet-scribe repo)
4. Select /frontend as root directory
5. Add environment variables (see DEPLOYMENT.md table)
6. Click Deploy → Wait 3-5 min
7. Frontend auto-accessible
```

**Frontend URL Format**: `https://meet-scribe.vercel.app`

---

## 📋 Required Environment Variables

### BEFORE YOU START - Gather These:

1. **Supabase** (PostgreSQL)
   - [ ] DATABASE_URL (connection string)

2. **Clerk** (Auth)
   - [ ] CLERK_DOMAIN
   - [ ] CLERK_SECRET_KEY
   - [ ] CLERK_WEBHOOK_SECRET

3. **Google Cloud** (Speech, Storage, Gemini)
   - [ ] GOOGLE_CLOUD_PROJECT
   - [ ] GOOGLE_CREDENTIALS_JSON (base64-encoded)
   - [ ] GEMINI_API_KEY

4. **Upstash** (Redis)
   - [ ] UPSTASH_REDIS_URL
   - [ ] UPSTASH_REDIS_TOKEN

5. **Pinecone** (Vector DB)
   - [ ] PINECONE_API_KEY

6. **Sentry** (Error tracking - optional)
   - [ ] SENTRY_DSN

---

## ✅ Verification Checklist

After deployment:

- [ ] Backend health check passes: `curl https://meet-scribe-backend.onrender.com/health`
- [ ] Frontend loads: Visit `https://meet-scribe.vercel.app`
- [ ] Clerk login appears
- [ ] Can sign in/up
- [ ] Dashboard loads with no CORS errors
- [ ] Console has no env var warnings

---

## 🔗 Dashboard Links After Deployment

```
Render Dashboard: https://dashboard.render.com
Vercel Dashboard: https://vercel.com/dashboard
Your Backend: https://meet-scribe-backend.onrender.com
Your Frontend: https://meet-scribe.vercel.app
```

---

## 💡 Pro Tips

- **First deploy takes longer** (build cache empty)
- **Env vars need redeploy** to take effect
- **Check logs early** if something fails
- **Render free tier sleeps after 15min inactivity** - consider paid plan for production
- **Vercel has generous free tier** - no auto-sleep

---

## 🆘 Common Issues

| Issue | Fix |
|-------|-----|
| Backend won't deploy | Check Docker builds locally first |
| Frontend blank page | Check env vars in Vercel dashboard |
| CORS errors | Verify FRONTEND_URL in render.yaml matches Vercel URL |
| Auth not working | Ensure Clerk webhook URL is set on backend |
| Redis/DB errors | Double-check connection strings copied exactly |

---

## See Also
- Full guide: `DEPLOYMENT.md`
- Backend config: `backend/.env.example`
- Frontend config: `frontend/.env.local.example`
