# 🎯 DEPLOYMENT QUICK REFERENCE

**Meet-Scribe is ready to deploy. Here's your path to live.**

---

## 📋 THE PLAN

```
Step 1: Gather Credentials (30 min)      ← External accounts
Step 2: Run Setup Script (2 min)         ← Create .env files  
Step 3: Validate Credentials (1 min)     ← Quick checks
Step 4: Deploy Backend (7 min)           ← Render
Step 5: Deploy Frontend (5 min)          ← Vercel
Step 6: Verify & Test (2 min)            ← Health checks
─────────────────────────────────────────────────
TOTAL: ~47 minutes to live ✨
```

---

## 🚀 YOUR NEXT ACTIONS

### Action 1: Setup (Right Now)
```powershell
cd scripts
./setup-env.ps1 -InteractiveMode
```

### Action 2: Gather Credentials
Use the checklist in **CREDENTIAL_CHECKLIST.md** to get:
- Supabase DB connection
- Clerk API keys
- Google Cloud credentials
- Upstash Redis URL/token
- Pinecone API key

### Action 3: Validate
```powershell
./validate-credentials.ps1
```

### Action 4: Deploy Everything
```powershell
./deploy-all.ps1 -Mode "interactive"
```

---

## 📂 DOCUMENTATION FILES

| File | Purpose | Read When |
|------|---------|-----------|
| **QUICK_DEPLOY.md** | 2-minute overview | First time |
| **DEPLOYMENT.md** | Complete guide | Need details |
| **AUTOMATED_DEPLOYMENT.md** | Script reference | Using scripts |
| **scripts/README.md** | Script documentation | Troubleshooting |

---

## 🔑 CREDENTIALS NEEDED

**Before running scripts, gather:**

1. **Supabase** (5 min setup)
   - Sign up: supabase.com
   - Create project
   - Copy DATABASE_URL

2. **Clerk** (5 min setup)
   - Sign up: clerk.dev
   - Create application
   - Copy API keys & webhook secret

3. **Google Cloud** (10 min setup)
   - Create project: console.cloud.google.com
   - Enable APIs: Speech-to-Text, Cloud Storage, Generative AI
   - Create service account + JSON key (base64 encode)
   - Create storage bucket
   - Get Gemini API key

4. **Upstash** (5 min setup)
   - Sign up: upstash.com
   - Create Redis database
   - Copy REST API URL & token

5. **Pinecone** (5 min setup)
   - Sign up: pinecone.io
   - Create API key
   - Create index (dimension: 768)

6. **Render** (Create account)
   - Sign up: render.com
   - Connect GitHub

7. **Vercel** (Create account)
   - Sign up: vercel.com
   - Connect GitHub

---

## ⚡ THE COMMAND

**One command to deploy (semi-auto):**
```powershell
cd scripts
./deploy-all.ps1 -Mode "interactive"
```

**One command to deploy (fully auto):**
```powershell
cd scripts
./deploy-all.ps1 -Mode "auto"
```

---

## ✅ VERIFY AFTER DEPLOYMENT

```powershell
cd scripts
./verify-deployment.ps1
```

Should show:
- ✅ Backend health check passed
- ✅ Frontend loads
- ✅ CORS is properly configured
- ✅ API connection works
- ✅ Authentication appears configured

---

## 🎯 TIMELINE

**Time breakdown:**

| Phase | Time | What You Do |
|-------|------|-----------|
| Account Creation | 10 min | Sign up for all services |
| Credential Setup | 30 min | Configure each service |
| Local Validation | 5 min | Run scripts to verify |
| Backend Deploy | 7 min | Watch Render build |
| Frontend Deploy | 5 min | Watch Vercel build |
| Verification | 2 min | Run health checks |
| Testing | 5+ min | Visit site, try features |
| **TOTAL** | **~60 min** | **LIVE & WORKING** ✨ |

---

## 💡 HELPFUL TIPS

✅ **Do:**
- Keep all credentials in .env files (.gitignore prevents commits)
- Test locally first: `docker build -f backend/Dockerfile backend`
- Save Dashboard URLs for quick access
- Monitor logs in Render & Vercel dashboards
- Keep .env.example files synced for team

❌ **Don't:**
- Commit .env or .env.local files
- Share API keys/secrets with others
- Use free tier for production (auto-sleeps)
- Forget to set FRONTEND_URL in render.yaml

---

## 🐛 IF SOMETHING FAILS

**Check these first:**
1. All credentials are correct (run `./validate-credentials.ps1`)
2. Repository is pushed to GitHub and public
3. Render/Vercel can access the repo
4. Docker builds locally (test with `docker build`)
5. Next.js builds locally (test with `npm run build` in frontend)

**Then check logs:**
- Render logs: https://dashboard.render.com
- Vercel logs: https://vercel.com/dashboard
- Browser console (F12)

**Common issues:**
- CORS errors → Check FRONTEND_URL in render.yaml
- Blank frontend → Missing env vars, redeploy after adding
- Backend 502 → Check Render logs for startup errors
- Auth not working → Verify Clerk webhook URL & secret

---

## 📊 YOUR DEPLOYMENT STRUCTURE

```
Backend (FastAPI)
     ↓
Render (onrender.com)
https://meet-scribe-backend.onrender.com
     ↓
Frontend (Next.js)
     ↓
Vercel (vercel.app)
https://meet-scribe.vercel.app
     ↓
Database: Supabase
Cache: Upstash Redis
Search: Pinecone Vectors
Auth: Clerk
Storage: Google Cloud
```

---

## 🎓 SCRIPT QUICK REFERENCE

```powershell
# Setup
./setup-env.ps1 -InteractiveMode

# Validate
./validate-credentials.ps1 -Verbose

# Deploy
./deploy-backend.ps1
./deploy-frontend.ps1

# Verify
./verify-deployment.ps1

# All-in-one
./deploy-all.ps1 -Mode "interactive"
```

---

## 📞 DOCS REFERENCE

- Full guide: `../DEPLOYMENT.md`
- Script docs: `README.md`
- Original setup: `../QUICK_DEPLOY.md`
- Advanced: `../AUTOMATED_DEPLOYMENT.md`

---

## 🎬 START HERE

**If you're starting now:**

1. Read this file ✓ (you are here)
2. Create accounts (Render, Vercel, Supabase, etc.)
3. Gather credentials
4. Run: `./setup-env.ps1 -InteractiveMode`
5. Run: `./validate-credentials.ps1`
6. Run: `./deploy-all.ps1 -Mode "interactive"`
7. Visit: https://meet-scribe.vercel.app

**Total time: ~1 hour to fully deployed** ⏱️

---

🚀 Ready? Let's go!
