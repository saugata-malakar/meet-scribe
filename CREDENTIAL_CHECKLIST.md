# 🔑 CREDENTIAL GATHERING CHECKLIST

**Collect all credentials needed for deployment**

⏱️ **Est. Time: 45 minutes** (varies by service response time)

---

## 1️⃣ SUPABASE (PostgreSQL Database)

Time: ~5 min | Cost: Free tier available

- [ ] Go to https://supabase.com
- [ ] Sign up / Log in
- [ ] Create new project
- [ ] Wait for database to initialize (~1-2 min)
- [ ] Go to **Settings** → **Database** → **Connection Strings**
- [ ] Select **URI** tab
- [ ] Copy the connection string (includes password)
- [ ] Paste into: **Backend environment setup**

**Variable:** `DATABASE_URL`
```
postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
```

---

## 2️⃣ CLERK (Authentication)

Time: ~10 min | Cost: Free tier available

### Create Account & App
- [ ] Go to https://dashboard.clerk.com
- [ ] Sign up / Log in
- [ ] Create application (choose framework: "None" for API)
- [ ] Go to **API Keys**

### Get Keys
- [ ] Copy **Publishable Key** (`pk_live_...`)
  - **Variable:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Frontend)
- [ ] Copy **Secret Key** (`sk_live_...`)
  - **Variable:** `CLERK_SECRET_KEY` (Backend & Frontend)
  - ⚠️ Keep this SECRET!

### Get Webhook Secret
- [ ] Go to **Webhooks** in Clerk dashboard
- [ ] Create new webhook
- [ ] URL: `https://meet-scribe-backend.onrender.com/webhooks/clerk`
- [ ] Events: User created, User updated, User deleted
- [ ] Copy **Signing Secret**
  - **Variable:** `CLERK_WEBHOOK_SECRET` (Backend)

### Get Domain
- [ ] Go to **API Keys**
- [ ] Find domain (e.g., `app.clerk.accounts.dev`)
  - **Variable:** `CLERK_DOMAIN` (Backend)

**Verification:** All three values start with correct prefixes:
- Publishable: `pk_live_`
- Secret: `sk_live_`
- Webhook: `whsec_`

---

## 3️⃣ GOOGLE CLOUD (Speech-to-Text, Storage, Gemini API)

Time: ~15 min | Cost: Free tier available (first $300 credit)

### Create Project
- [ ] Go to https://console.cloud.google.com
- [ ] Create new project (name: "meet-scribe")
- [ ] Enable required APIs:
  - [ ] Cloud Speech-to-Text API
  - [ ] Cloud Storage API
  - [ ] Generative AI API (Gemini)

### Get Project ID
- [ ] Go to **Project Settings** (Top menu)
- [ ] Copy **Project ID** (e.g., `meet-scribe-abc123`)
  - **Variable:** `GOOGLE_CLOUD_PROJECT` (Backend)

### Create Service Account
- [ ] Go to **APIs & Services** → **Credentials**
- [ ] Click **Create Credentials** → **Service Account**
- [ ] Enter details:
  - Name: "meet-scribe-app"
  - Grant roles: Editor (for testing; use specific roles in prod)
- [ ] Click **Create**
- [ ] Go to service account → **Keys** tab
- [ ] Click **Add Key** → **Create new key**
- [ ] Choose JSON format
- [ ] Download JSON file

### Encode Service Account
**On Windows PowerShell:**
```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\path\to\downloaded-key.json")
$base64 = [Convert]::ToBase64String($bytes)
Write-Host $base64 | Set-Clipboard
```

**On macOS/Linux:**
```bash
base64 -w 0 downloaded-key.json | pbcopy
```

- [ ] Paste into: **Backend environment setup**
  - **Variable:** `GOOGLE_CREDENTIALS_JSON` (Backend)

### Create Storage Bucket
- [ ] Go to **Cloud Storage** → **Buckets**
- [ ] Click **Create Bucket**
- [ ] Name: `meet-scribe-storage`
- [ ] Region: Use your region or `US`
- [ ] Use defaults for other settings
- [ ] Create!
  - **Variable:** `GCS_BUCKET_NAME` or just keep default (Backend)

### Get Gemini API Key
- [ ] Go to https://aistudio.google.com/app/apikey
- [ ] Create API key
- [ ] Copy it
  - **Variable:** `GEMINI_API_KEY` (Backend)
  - ⚠️ Keep this SECRET!

---

## 4️⃣ UPSTASH (Redis Cache)

Time: ~5 min | Cost: Free tier available (1GB)

- [ ] Go to https://console.upstash.com
- [ ] Sign up / Log in
- [ ] Create new database
- [ ] Name: "meet-scribe"
- [ ] Region: Use your region
- [ ] Type: Redis
- [ ] Click **Create**
- [ ] Go to database → **REST API** tab
- [ ] Copy **UPSTASH_REDIS_REST_URL**
  - **Variable:** `UPSTASH_REDIS_URL` (Backend)
- [ ] Copy **UPSTASH_REDIS_REST_TOKEN**
  - **Variable:** `UPSTASH_REDIS_TOKEN` (Backend)
  - ⚠️ Keep this SECRET!

---

## 5️⃣ PINECONE (Vector Database)

Time: ~5 min | Cost: Free tier available

### Create Account & Project
- [ ] Go to https://www.pinecone.io
- [ ] Sign up / Log in
- [ ] Create new project
- [ ] Region: Use your region or `us-east-1`

### Get API Key
- [ ] Go to **API Keys**
- [ ] View existing key or create new
- [ ] Copy API key (starts with `pcsk_`)
  - **Variable:** `PINECONE_API_KEY` (Backend)
  - ⚠️ Keep this SECRET!

### Create Index
- [ ] Go to **Indexes**
- [ ] Click **Create Index**
- [ ] Name: `meet-scribe`
- [ ] Dimension: `768` (for embeddings)
- [ ] Metric: `cosine`
- [ ] Pod Type: `s1` (free)
- [ ] Create!
  - **Variable:** `PINECONE_INDEX_NAME` (Backend) = "meet-scribe"
  - **Variable:** `PINECONE_ENVIRONMENT` (Backend) = your region (e.g., "us-east-1")

---

## 6️⃣ SENTRY (Error Tracking - Optional)

Time: ~3 min | Cost: Free tier available

- [ ] Go to https://sentry.io
- [ ] Sign up / Log in
- [ ] Create new project
- [ ] Platform: Python (for backend monitoring)
- [ ] Go to **Settings** → **Client Keys (DSN)**
- [ ] Copy DSN URL
  - **Variable:** `SENTRY_DSN` (Backend - optional)
  - **Variable:** `NEXT_PUBLIC_SENTRY_DSN` (Frontend - optional)

---

## 7️⃣ RENDER (Backend Hosting)

Time: ~2 min | Cost: Free tier available ($7/mon)

- [ ] Go to https://render.com
- [ ] Sign up / Log in
- [ ] Connect Github account
- [ ] ✓ (No credentials needed - just account setup)

---

## 8️⃣ VERCEL (Frontend Hosting)

Time: ~2 min | Cost: Free tier available

- [ ] Go to https://vercel.com
- [ ] Sign up / Log in
- [ ] Connect GitHub account
- [ ] ✓ (No credentials needed - just account setup)

---

## ✅ CREDENTIALS SUMMARY

**In your backend `.env`:**
```env
DATABASE_URL=postgresql://...
CLERK_DOMAIN=app.clerk.accounts.dev
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
GEMINI_API_KEY=AIza...
GOOGLE_CLOUD_PROJECT=meet-scribe-abc123
GOOGLE_CREDENTIALS_JSON=eyJt... (base64)
GCS_BUCKET_NAME=meet-scribe-storage
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxxx...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=meet-scribe
SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX (optional)
```

**In your frontend `.env.local`:**
```env
NEXT_PUBLIC_API_URL=https://meet-scribe-backend.onrender.com
NEXT_PUBLIC_WS_URL=wss://meet-scribe-backend.onrender.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_... (same as backend)
NEXT_PUBLIC_POSTHOG_KEY=phc_... (optional)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX (optional)
```

---

## 🔒 SECURITY BEST PRACTICES

✅ **DO:**
- [ ] Use strong, unique passwords for each service
- [ ] Enable 2FA on cloud accounts
- [ ] Rotate API keys periodically
- [ ] Store `.env` files locally only (never commit)
- [ ] Use free tier for testing, paid for production
- [ ] Monitor API usage in each dashboard

❌ **DON'T:**
- [ ] Share `.env` files
- [ ] Put credentials in code/comments
- [ ] Use same API key for dev & production
- [ ] Push `.env` to GitHub
- [ ] Share API keys in chat/email
- [ ] Use development keys in production

---

## 📋 CHECKLIST

<details>
<summary><strong>Click to expand full checklist</strong></summary>

### Supabase
- [ ] Account created
- [ ] Project created
- [ ] DATABASE_URL copied

### Clerk
- [ ] Account created
- [ ] App created
- [ ] CLERK_DOMAIN copied
- [ ] CLERK_SECRET_KEY copied
- [ ] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY copied
- [ ] Webhook created
- [ ] CLERK_WEBHOOK_SECRET copied

### Google Cloud
- [ ] Account created
- [ ] Project created
- [ ] APIs enabled (Speech, Storage, Generative AI)
- [ ] GOOGLE_CLOUD_PROJECT ID copied
- [ ] Service account created
- [ ] Service account JSON downloaded
- [ ] JSON base64 encoded → GOOGLE_CREDENTIALS_JSON
- [ ] Storage bucket created → GCS_BUCKET_NAME
- [ ] GEMINI_API_KEY obtained

### Upstash
- [ ] Account created
- [ ] Redis database created
- [ ] UPSTASH_REDIS_URL copied
- [ ] UPSTASH_REDIS_TOKEN copied

### Pinecone
- [ ] Account created
- [ ] PINECONE_API_KEY copied
- [ ] Index created (768 dimensions)
- [ ] PINECONE_INDEX_NAME set
- [ ] PINECONE_ENVIRONMENT set

### Sentry (Optional)
- [ ] Account created (optional)
- [ ] Project created (optional)
- [ ] SENTRY_DSN copied (optional)

### Hosting
- [ ] Render account created
- [ ] Vercel account created
- [ ] GitHub connected to both

</details>

---

## 🚀 NEXT STEPS

Once you have all credentials:

1. Run: `cd scripts`
2. Run: `./setup-env.ps1 -InteractiveMode`
3. Enter credentials when prompted
4. Run: `./validate-credentials.ps1`
5. Run: `./deploy-all.ps1 -Mode "interactive"`

**Total collection time: ~45 minutes**
**Total deployment time: ~15 minutes**
**Total: ~1 hour to live** ✨

---

## 💡 PRO TIPS

- **Save time:** Open all service dashboards in tabs
- **Copy carefully:** One character wrong breaks everything
- **Test local:** `./validate-credentials.ps1` checks before deploying
- **Document:** Keep a password manager with all credentials
- **Share safely:** Use 1Password/Vault for team sharing (not email!)

---

## 🆘 STUCK?

- Missing a credential? Try: `./validate-credentials.ps1 -Test "service-name"`
- Need to fix .env? Edit: `backend/.env` or `frontend/.env.local`
- Want detailed docs? See: `../DEPLOYMENT.md`
- Ready to deploy? Run: `./deploy-all.ps1 -Mode "interactive"`
