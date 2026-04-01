# ⚡ AUTOMATED DEPLOYMENT GUIDE

**Full end-to-end automation for Meet-Scribe using scripts**

---

## 🚀 Quick Start (3 minutes)

### Option 1: Fully Automated (Recommended)
```powershell
cd scripts
./deploy-all.ps1 -Mode "auto"
```

### Option 2: Interactive with Confirmations
```powershell
cd scripts
./deploy-all.ps1 -Mode "interactive"
```

### Option 3: Step-by-Step Manual Control
```powershell
cd scripts
./setup-env.ps1 -InteractiveMode              # Setup env vars
./validate-credentials.ps1                     # Verify credentials
./deploy-backend.ps1                           # Deploy to Render
./deploy-frontend.ps1                          # Deploy to Vercel
./verify-deployment.ps1                        # Verify both running
```

---

## 📦 What Gets Deployed

| Component | Where | Automated |
|-----------|-------|-----------|
| **Backend** | Render | Via render.yaml |
| **Frontend** | Vercel | Via vercel.json |
| **Database** | Supabase | Manual setup (credentials) |
| **Auth** | Clerk | Manual setup (credentials) |
| **Storage** | Google Cloud | Manual setup (credentials) |
| **Cache** | Upstash Redis | Manual setup (credentials) |
| **Vectors** | Pinecone | Manual setup (credentials) |

---

## ✅ Pre-Deployment Checklist

- [ ] **Accounts Created**
  - [ ] Render (render.com)
  - [ ] Vercel (vercel.com)
  - [ ] Supabase (supabase.com)
  - [ ] Clerk (clerk.dev)
  - [ ] Google Cloud (console.cloud.google.com)
  - [ ] Upstash (upstash.com)
  - [ ] Pinecone (pinecone.io)

- [ ] **Credentials Gathered**
  - [ ] Supabase: DATABASE_URL
  - [ ] Clerk: Domain, Secret Key, Webhook Secret
  - [ ] Google: Project ID, Service Account JSON, Gemini API Key, GCS Bucket
  - [ ] Upstash: Redis URL & Token
  - [ ] Pinecone: API Key & Index Name

- [ ] **Repository Ready**
  - [ ] Code pushed to GitHub
  - [ ] Repository is public (or Render/Vercel authorized)
  - [ ] All `.env.example` files present

- [ ] **Local Tools Installed**
  - [ ] Node.js & npm
  - [ ] Render CLI: `npm install -g @render-in/render-cli`
  - [ ] Vercel CLI: `npm install -g vercel`
  - [ ] Docker (for local testing)

---

## 🔧 Script Reference

### `setup-env.ps1`
**Creates environment variable files**
```powershell
./setup-env.ps1                    # Copy templates only
./setup-env.ps1 -InteractiveMode   # Prompt for each value
```
Creates:
- `backend/.env`
- `frontend/.env.local`

### `validate-credentials.ps1`
**Validates all credentials present and formatted correctly**
```powershell
./validate-credentials.ps1           # Full validation
./validate-credentials.ps1 -Verbose  # Detailed output
./validate-credentials.ps1 -Test "clerk"  # Test specific service
```

Validates:
- Database connection string
- All API keys & secrets
- URLs & Project IDs
- Optional services (Sentry, PostHog)

### `deploy-backend.ps1`
**Deploy FastAPI backend to Render**
```powershell
./deploy-backend.ps1                 # Interactive
./deploy-backend.ps1 -Mode "auto"    # Fully automated
```

Does:
- Checks Render CLI authentication
- Tests Docker build locally
- Prepares for Render deployment
- Provides dashboard with instructions

### `deploy-frontend.ps1`
**Deploy Next.js frontend to Vercel**
```powershell
./deploy-frontend.ps1                            # Interactive
./deploy-frontend.ps1 -BackendUrl "https://..." # Custom backend
./deploy-frontend.ps1 -Mode "auto"              # Fully automated
```

Does:
- Checks Vercel CLI authentication
- Verifies Node.js dependencies
- Tests Next.js build locally
- Provides deployment instructions

### `verify-deployment.ps1`
**Test both deployments are working**
```powershell
./verify-deployment.ps1                                                # Default URLs
./verify-deployment.ps1 -BackendUrl "https://..." -FrontendUrl "..."  # Custom URLs
./verify-deployment.ps1 -Verbose                                      # Detailed output
```

Tests:
- Backend health endpoint
- Frontend accessibility
- CORS configuration
- API connectivity
- Authentication setup

### `deploy-all.ps1`
**Master orchestration script (runs all steps)**
```powershell
./deploy-all.ps1 -Mode "interactive"              # Ask at each step
./deploy-all.ps1 -Mode "auto"                     # Full automation
./deploy-all.ps1 -SkipSteps "setup,validate"      # Skip certain steps
```

Runs all steps:
1. Prerequisite checks
2. Environment setup
3. Credential validation
4. Backend deployment
5. Frontend deployment
6. Verification tests
7. Summary & next steps

---

## 🔐 Environment Variables

### Backend (.env) - 14 variables required

| Variable | Source |
|----------|--------|
| DATABASE_URL | Supabase → Settings → Database |
| CLERK_DOMAIN | Clerk → API Keys |
| CLERK_SECRET_KEY | Clerk → API Keys → Secret Key |
| CLERK_WEBHOOK_SECRET | Clerk → Webhooks |
| GEMINI_API_KEY | Google AI Studio → API Keys |
| GOOGLE_CLOUD_PROJECT | GCP → Project ID |
| GOOGLE_CREDENTIALS_JSON | GCP → Service Account (base64) |
| GCS_BUCKET_NAME | Google Cloud Storage |
| UPSTASH_REDIS_URL | Upstash Console → REST API |
| UPSTASH_REDIS_TOKEN | Upstash Console → REST API |
| PINECONE_API_KEY | Pinecone → API Keys |
| PINECONE_INDEX_NAME | Pinecone → Indexes |
| SENTRY_DSN | Sentry → Project DSN (optional) |

### Frontend (.env.local) - 10 variables

| Variable | Value |
|----------|-------|
| NEXT_PUBLIC_API_URL | https://meet-scribe-backend.onrender.com |
| NEXT_PUBLIC_WS_URL | wss://meet-scribe-backend.onrender.com |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk → API Keys (Publishable) |
| CLERK_SECRET_KEY | Clerk → API Keys (Secret) |
| NEXT_PUBLIC_POSTHOG_KEY | PostHog → Project Settings (optional) |
| NEXT_PUBLIC_SENTRY_DSN | Sentry → DSN (optional) |

---

## 📊 Typical Timeline

| Step | Time | Notes |
|------|------|-------|
| Setup environment | 1 min | Copying files, entering credentials |
| Validate credentials | 1 min | Quick format checks |
| Deploy backend | 7 min | Docker build + Render push |
| Deploy frontend | 5 min | Next.js build + Vercel push |
| Verify | 2 min | Health checks & connectivity tests |
| **Total** | **16 min** | First deployment (caches make it faster after) |

---

## 🐛 Troubleshooting

### "Render CLI not found"
```powershell
npm install -g @render-in/render-cli
render --version
```

### "Vercel CLI not found"
```powershell
npm install -g vercel
vercel --version
```

### "Scripts won't execute - permission denied"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Not authenticated with Render"
```powershell
render login
render auth
```

### "Not authenticated with Vercel"
```powershell
vercel login
```

### "Backend deployment fails"
1. Test Docker build locally: `docker build -f backend/Dockerfile backend`
2. Check logs in Render dashboard
3. Verify all env vars are set
4. Check `.env` file syntax

### "Frontend build fails"
1. Test build locally: `cd frontend && npm run build`
2. Check Next.js errors
3. Verify all `NEXT_PUBLIC_*` variables
4. Check `.env.local` syntax

### "Frontend can't connect to backend"
1. Verify `NEXT_PUBLIC_API_URL` matches backend URL
2. Check CORS configuration
3. Verify backend is running (health check)
4. Check network firewall rules

### "Authentication not working"
1. Verify Clerk keys are correct
2. Check Clerk webhook is configured
3. Verify webhook secret matches
4. Check Clerk dashboard for errors

---

## 🚀 Common Commands

```powershell
# Full deployment
./deploy-all.ps1 -Mode "interactive"

# Just setup env vars and validate
./setup-env.ps1 -InteractiveMode
./validate-credentials.ps1 -Verbose

# Just backend
./deploy-backend.ps1 -Mode "auto"
./monitor-deployment.ps1 -Service "backend"

# Just frontend
./deploy-frontend.ps1 -BackendUrl "https://my-backend.onrender.com"

# Verification only
./verify-deployment.ps1 -Verbose

# Check specific credential
./validate-credentials.ps1 -Test "clerk"

# Clean up temp files
./cleanup.ps1
```

---

## 📊 Deployment Architecture

```
Your Repository (GitHub)
    ├── backend/ 
    │   ├── app/
    │   ├── Dockerfile
    │   ├── requirements.txt
    │   └── .env (created by setup-env.ps1)
    │
    ├── frontend/
    │   ├── src/
    │   ├── package.json
    │   ├── next.config.mjs
    │   └── .env.local (created by setup-env.ps1)
    │
    ├── render.yaml (backend config)
    ├── vercel.json (frontend config)
    │
    └── scripts/ (automation)
        ├── deploy-all.ps1
        ├── setup-env.ps1
        ├── validate-credentials.ps1
        ├── deploy-backend.ps1
        ├── deploy-frontend.ps1
        └── verify-deployment.ps1

                    ↓
        ┌───────────┴────────────┐
        ↓                        ↓
    Render                    Vercel
  (Backend)                (Frontend)
  https://                https://
  meet-scribe-            meet-scribe.
  backend.                vercel.
  onrender.com            app
```

---

## ✨ After Deployment

### First Steps
1. **Visit your frontend:** https://meet-scribe.vercel.app
2. **Sign up** with Clerk
3. **Test dashboard** - create a session
4. **Check browser console** for errors
5. **Check Render logs** - backend errors
6. **Check Vercel logs** - frontend errors

### Monitor & Maintain
- **Render Dashboard:** https://dashboard.render.com
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Check logs regularly** for errors
- **Monitor costs** - especially storage & compute

### Scale Up (Future)
- Upgrade Render plan for production traffic
- Add custom domain to both Render & Vercel
- Enable analytics (Sentry, PostHog)
- Set up CI/CD notifications
- Regular database backups

---

## 🎓 Advanced Usage

### Redeploy After Changes
```powershell
# Just push to GitHub, both platforms auto-deploy
git add .
git commit -m "Update feature"
git push origin main

# Or manually trigger via CLI
render deploy  # Backend
vercel --prod # Frontend
```

### Use Custom Backend URL
```powershell
./deploy-frontend.ps1 -BackendUrl "https://my-custom-domain.com"
```

### Skip Certain Steps
```powershell
./deploy-all.ps1 -SkipSteps "validate,backend"  # Only deploy frontend
```

### Debug Mode
```powershell
./deploy-all.ps1 -Verbose -Mode "interactive"
```

### Test Specific Services
```powershell
./validate-credentials.ps1 -Test "supabase"
./validate-credentials.ps1 -Test "clerk"
./validate-credentials.ps1 -Test "google"
```

---

## 📞 Support

- **Full deployment guide:** [../DEPLOYMENT.md](../DEPLOYMENT.md)
- **Quick checklist:** [../QUICK_DEPLOY.md](../QUICK_DEPLOY.md)
- **Render docs:** https://render.com/docs
- **Vercel docs:** https://vercel.com/docs
- **Issue troubleshooting:** Check platform dashboards:
  - Render: https://dashboard.render.com
  - Vercel: https://vercel.com/dashboard

---

## 🎯 Success Metrics

Deployment is successful when:
- ✅ Backend health check returns 200
- ✅ Frontend loads without blank page
- ✅ Can sign in with Clerk
- ✅ Dashboard loads
- ✅ No CORS errors in console
- ✅ Backend logs show successful requests
- ✅ Frontend loads performance is <3s

**Total time to live: ~15-20 minutes** ⏱️
