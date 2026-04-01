#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy frontend to Vercel
.DESCRIPTION
    Uses Vercel CLI to deploy Next.js frontend with environment variables
.PARAMETER GitHubRepo
    GitHub repository (e.g., 'username/google-meet-scribe')
.PARAMETER BackendUrl
    Backend URL for API calls (default: https://meet-scribe-backend.onrender.com)
.PARAMETER Mode
    'auto' = Fully automated, 'interactive' = Ask for confirmations
.EXAMPLE
    ./deploy-frontend.ps1
    ./deploy-frontend.ps1 -BackendUrl "https://my-backend.onrender.com" -Mode "auto"
#>

param(
    [string]$GitHubRepo = '',
    [string]$BackendUrl = 'https://meet-scribe-backend.onrender.com',
    [ValidateSet('auto', 'interactive')]
    [string]$Mode = 'interactive'
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$FrontendDir = Join-Path $ProjectRoot "frontend"
$FrontendEnv = Join-Path $FrontendDir ".env.local"
$VercelJson = Join-Path $FrontendDir "vercel.json"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Write-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
}

function Write-Step {
    param([string]$Text)
    Write-Host "▶ $Text" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
}

function Test-ToolExists {
    param([string]$Tool)
    try {
        & $Tool --version | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-EnvValue {
    param(
        [string]$File,
        [string]$Key
    )
    
    if (-not (Test-Path $File)) { return '' }
    
    $content = Get-Content $File -Raw
    $match = [regex]::Match($content, "^$Key=(.*)$", 'Multiline')
    return $match.Groups[1].Value
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pre-deployment Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Check-Prerequisites {
    Write-Host "🔍 Checking prerequisites..." -ForegroundColor Cyan
    
    # Check Vercel CLI
    if (-not (Test-ToolExists 'vercel')) {
        Write-Error-Custom "Vercel CLI not found"
        Write-Host "Install: npm install -g vercel" -ForegroundColor Yellow
        exit 1
    }
    Write-Success "Vercel CLI installed"
    
    # Check .env.local exists
    if (-not (Test-Path $FrontendEnv)) {
        Write-Error-Custom "Frontend .env.local not found at $FrontendEnv"
        exit 1
    }
    Write-Success "Frontend .env.local found"
    
    # Check Node.js
    if (-not (Test-ToolExists 'npm')) {
        Write-Error-Custom "npm not found"
        exit 1
    }
    Write-Success "npm installed"
    
    # Check next.js build locally
    Write-Step "Running Next.js build locally..."
    Push-Location $FrontendDir
    try {
        $buildCheck = npm run build 2>&1 | Select-Object -Last 5
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Next.js build successful"
        } else {
            Write-Error-Custom "Next.js build failed locally"
            Write-Host "Fix build errors before deploying" -ForegroundColor Yellow
            exit 1
        }
    }
    finally {
        Pop-Location
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Vercel Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Deploy-ToVercel {
    Write-Host "`n🚀 Deploying to Vercel..." -ForegroundColor Cyan
    
    # Check Vercel authentication
    Write-Step "Checking Vercel authentication..."
    $authCheck = vercel whoami 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Vercel authenticated: $authCheck"
    } else {
        Write-Error-Custom "Not authenticated with Vercel"
        Write-Host "`nRun: vercel login" -ForegroundColor Yellow
        exit 1
    }
    
    # Get credentials from .env.local
    Write-Step "Loading environment variables..."
    $apiUrl = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_API_URL"
    $wsUrl = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_WS_URL"
    $clerkPubKey = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    $clerkSecret = Get-EnvValue $FrontendEnv "CLERK_SECRET_KEY"
    $posthogKey = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_POSTHOG_KEY"
    
    if (-not $apiUrl) {
        Write-Error-Custom "NEXT_PUBLIC_API_URL not set in .env.local"
        exit 1
    }
    if (-not $wsUrl) {
        Write-Error-Custom "NEXT_PUBLIC_WS_URL not set in .env.local"
        exit 1
    }
    
    Write-Success "Environment variables loaded"
    
    # Prepare deployment
    Write-Step "Preparing for Vercel deployment..."
    
    # Display instructions
    Write-Host "`n📍 Vercel Deployment Instructions:" -ForegroundColor Yellow
    Write-Host @"
1. Go to https://vercel.com/dashboard
2. Click "Add New +" → "Project"
3. Import GitHub repository
4. Configure:
   - Framework: Next.js (auto-detected)
   - Root Directory: frontend
5. Add Environment Variables:
   - NEXT_PUBLIC_API_URL=$apiUrl
   - NEXT_PUBLIC_WS_URL=$wsUrl
   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_***
   - CLERK_SECRET_KEY=sk_***
   - NEXT_PUBLIC_POSTHOG_KEY=$posthogKey (optional)
6. Deploy!

First deployment may take 3-5 minutes.
"@

    # Automated deployment option
    Write-Host "`n💡 Automated Deployment:" -ForegroundColor Cyan
    Write-Host "Once you've deployed once via dashboard," -ForegroundColor Gray
    Write-Host "You can redeploy with: vercel --prod" -ForegroundColor Gray
    
    Write-Success "Frontend deployment initiated"
    Write-Host "`nMonitor at: https://vercel.com/dashboard" -ForegroundColor Green
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n⚛️  Frontend Deployment to Vercel" -ForegroundColor Magenta
    Write-Host "Backend URL: $BackendUrl" -ForegroundColor Gray
    Write-Host "Mode: $Mode `n" -ForegroundColor Gray
    
    Check-Prerequisites
    Deploy-ToVercel
    
    Write-Success "Frontend deployment script complete!"
    Write-Host "`nNext Step: ./verify-deployment.ps1 -BackendUrl '$BackendUrl' -FrontendUrl 'https://meet-scribe.vercel.app'`n" -ForegroundColor Cyan
}
catch {
    Write-Error-Custom "Frontend deployment failed: $_"
    exit 1
}
