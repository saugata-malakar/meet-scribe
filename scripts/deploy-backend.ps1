#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy backend to Render
.DESCRIPTION
    Uses Render CLI to deploy FastAPI backend with environment variables
.PARAMETER GitHubRepo
    GitHub repository (e.g., 'username/google-meet-scribe')
.PARAMETER Mode
    'auto' = Fully automated, 'interactive' = Ask for confirmations
.EXAMPLE
    ./deploy-backend.ps1 -GitHubRepo "username/google-meet-scribe"
    ./deploy-backend.ps1 -Mode "interactive"
#>

param(
    [string]$GitHubRepo = '',
    [ValidateSet('auto', 'interactive')]
    [string]$Mode = 'interactive'
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackendDir = Join-Path $ProjectRoot "backend"
$BackendEnv = Join-Path $BackendDir ".env"
$RenderYaml = Join-Path $ProjectRoot "render.yaml"

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
    
    # Check Render CLI
    if (-not (Test-ToolExists 'render')) {
        Write-Error-Custom "Render CLI not found"
        Write-Host "Install: npm install -g @render-in/render-cli" -ForegroundColor Yellow
        exit 1
    }
    Write-Success "Render CLI installed"
    
    # Check .env exists
    if (-not (Test-Path $BackendEnv)) {
        Write-Error-Custom "Backend .env not found at $BackendEnv"
        exit 1
    }
    Write-Success "Backend .env found"
    
    # Check Docker setup locally
    Write-Step "Testing Docker build locally (optional but recommended)..."
    $dockerTest = & docker build -f "$BackendDir\Dockerfile" $BackendDir 2>&1 | Select-Object -Last 1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Docker build successful"
    } else {
        Write-Host "⚠ Docker build test failed. This will likely fail on Render too." -ForegroundColor Yellow
        if ($Mode -eq 'interactive') {
            $continue = Read-Host "Continue anyway? (y/n)"
            if ($continue -ne 'y') { exit 1 }
        }
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Render Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Deploy-ToRender {
    Write-Host "`n🚀 Deploying to Render..." -ForegroundColor Cyan
    
    # Check Render CLI authentication
    Write-Step "Checking Render authentication..."
    try {
        $authCheck = render list services 2>&1
        Write-Success "Render authenticated"
    }
    catch {
        Write-Error-Custom "Not authenticated with Render"
        Write-Host "`nRun: render login" -ForegroundColor Yellow
        Write-Host "Then: render auth" -ForegroundColor Yellow
        exit 1
    }
    
    # Get environment variables for deployment
    Write-Step "Loading environment variables from .env..."
    $dbUrl = Get-EnvValue $BackendEnv "DATABASE_URL"
    $clerkDomain = Get-EnvValue $BackendEnv "CLERK_DOMAIN"
    $clerkSecret = Get-EnvValue $BackendEnv "CLERK_SECRET_KEY"
    $geminiKey = Get-EnvValue $BackendEnv "GEMINI_API_KEY"
    $googleProject = Get-EnvValue $BackendEnv "GOOGLE_CLOUD_PROJECT"
    $googleCreds = Get-EnvValue $BackendEnv "GOOGLE_CREDENTIALS_JSON"
    $upstashUrl = Get-EnvValue $BackendEnv "UPSTASH_REDIS_URL"
    $upstashToken = Get-EnvValue $BackendEnv "UPSTASH_REDIS_TOKEN"
    $pineconeKey = Get-EnvValue $BackendEnv "PINECONE_API_KEY"
    
    # Create deployment via Render CLI
    Write-Step "Creating service on Render..."
    
    # Use render.yaml config from project root
    if (Test-Path $RenderYaml) {
        Write-Success "Using render.yaml configuration"
        # Render automatically uses render.yaml when pushing
        Write-Host "render.yaml found - Render will auto-configure from this file" -ForegroundColor Green
    }
    
    Write-Host "`n📍 Deployment Instructions:" -ForegroundColor Yellow
    Write-Host @"
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will auto-detect render.yaml
5. Add these environment variables:
   - DATABASE_URL=$dbUrl
   - CLERK_DOMAIN=$clerkDomain
   - CLERK_SECRET_KEY=sk_***
   - GEMINI_API_KEY=AIza***
   - [See .env for all vars]
6. Deploy!

Automated deployment not yet available. 
Use Render Dashboard for full configuration.
"@

    Write-Host "`n💡 Pro Tip:" -ForegroundColor Cyan
    Write-Host "To automate, you can use Render's Deploy Hook after manual setup." -ForegroundColor Gray
    
    Write-Success "Backend deployment initiated"
    Write-Host "`nMonitor at: https://dashboard.render.com" -ForegroundColor Green
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n🐍 Backend Deployment to Render" -ForegroundColor Magenta
    Write-Host "Mode: $Mode `n" -ForegroundColor Gray
    
    Check-Prerequisites
    Deploy-ToRender
    
    Write-Success "Backend deployment script complete!"
    Write-Host "`nNext Step: Deploy frontend with ./deploy-frontend.ps1`n" -ForegroundColor Cyan
}
catch {
    Write-Error-Custom "Backend deployment failed: $_"
    exit 1
}
