# Deployment Automation Suite for Meet-Scribe

This folder contains scripts to automate the entire deployment process for Meet-Scribe.

## 📋 Prerequisites

### 1. Install Required Tools

**On Windows (PowerShell as Admin):**
```powershell
# Install Render CLI
npm install -g @render-in/render-cli

# Install Vercel CLI
npm install -g vercel

# Install jq (for JSON parsing)
choco install jq -y
```

**Or manually:**
- Render CLI: https://render.com/docs/cli
- Vercel CLI: https://vercel.com/docs/cli

### 2. GitHub Setup
- Repository must be pushed to GitHub
- You must have admin access to the repo

### 3. Accounts & API Keys Needed
See `DEPLOYMENT.md` for credential gathering instructions.

---

## 🚀 Quick Start

### Option A: Full Automated Deployment (Recommended)
```powershell
./deploy-all.ps1 -Mode "auto"
```

### Option B: Interactive Step-by-Step
```powershell
./deploy-all.ps1 -Mode "interactive"
```

### Option C: Manual Partial Deployment
```powershell
# Deploy only backend
./deploy-backend.ps1

# Deploy only frontend
./deploy-frontend.ps1

# Verify after deployment
./verify-deployment.ps1
```

---

## 📁 Scripts Overview

| Script | Purpose |
|--------|---------|
| `deploy-all.ps1` | Main orchestration script (runs everything) |
| `setup-env.ps1` | Create `.env` files from `.env.example` |
| `validate-credentials.ps1` | Check all credentials are valid |
| `deploy-backend.ps1` | Deploy to Render |
| `deploy-frontend.ps1` | Deploy to Vercel |
| `verify-deployment.ps1` | Test both deployments |
| `monitor-deployment.ps1` | Watch deployment logs |
| `cleanup.ps1` | Remove temporary files |

---

## 🔧 Detailed Usage

### 1. Setup Environment Variables
```powershell
./setup-env.ps1 -InteractiveMode
```
This creates `.env` and `.env.local` files with your credentials.

### 2. Validate Credentials
```powershell
./validate-credentials.ps1
```
Checks all credentials exist and have correct format.

### 3. Deploy Backend
```powershell
./deploy-backend.ps1 -GitHubRepo "your-username/google-meet-scribe"
```

### 4. Deploy Frontend
```powershell
./deploy-frontend.ps1 -GitHubRepo "your-username/google-meet-scribe" -BackendUrl "https://meet-scribe-backend.onrender.com"
```

### 5. Verify Everything Works
```powershell
./verify-deployment.ps1 -BackendUrl "https://meet-scribe-backend.onrender.com" -FrontendUrl "https://meet-scribe.vercel.app"
```

---

## 📊 Typical Timeline

| Step | Time |
|------|------|
| Setup environment variables | 1 min |
| Validate credentials | 1 min |
| Deploy backend to Render | 5-10 min |
| Deploy frontend to Vercel | 3-5 min |
| Verification tests | 2 min |
| **Total** | **12-19 min** |

---

## 🐛 Troubleshooting

### CLI tools not found
```powershell
# Reinstall globally
npm uninstall -g @render-in/render-cli vercel
npm install -g @render-in/render-cli vercel

# Verify
render --version
vercel --version
```

### Permission denied on scripts
```powershell
# Allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Credentials validation fails
```powershell
# Debug specific credential
./validate-credentials.ps1 -Verbose -Test "supabase"
```

---

## 📝 Configuration

### Customize Deployment
Edit `deploy-config.json`:
```json
{
  "render": {
    "name": "meet-scribe-backend",
    "plan": "starter",
    "region": "oregon"
  },
  "vercel": {
    "name": "meet-scribe",
    "public": true
  }
}
```

---

## 🔐 Security Notes

- `.env` files are created locally and NEVER committed
- Credentials stored safely in Render/Vercel dashboards only
- All scripts use official CLI tools  - No secrets logged in output
- Use `$env:DEBUG = $false` for production

---

## 📞 Support

- Render docs: https://render.com/docs
- Vercel docs: https://vercel.com/docs
- Meet-Scribe deployment guide: `DEPLOYMENT.md`

---

## ✅ Checklist Before Running

- [ ] All accounts created (Render, Vercel, Supabase, Clerk, Google Cloud, etc.)
- [ ] All credentials gathered (see `DEPLOYMENT.md`)
- [ ] Repository pushed to GitHub
- [ ] CLI tools installed (`render --version` and `vercel --version` work)
- [ ] PowerShell execution policy allows scripts

🎯 **Ready? Run:** `./deploy-all.ps1 -Mode "interactive"`
