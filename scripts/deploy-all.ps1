#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Main deployment orchestration script for Meet-Scribe
.DESCRIPTION
    Automates the entire deployment process:
    1. Setup environment variables
    2. Validate all credentials
    3. Deploy backend to Render
    4. Deploy frontend to Vercel
    5. Run verification tests
.PARAMETER Mode
    'auto' = Fully automated, 'interactive' = Ask for confirmations
.PARAMETER SkipSteps
    Comma-separated steps to skip: setup,validate,backend,frontend,verify
.EXAMPLE
    ./deploy-all.ps1 -Mode "interactive"
    ./deploy-all.ps1 -Mode "auto" -SkipSteps "setup,validate"
#>

param(
    [ValidateSet('auto', 'interactive')]
    [string]$Mode = 'interactive',
    
    [string]$SkipSteps = '',
    
    [string]$GitHubRepo = '',
    
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$WarningPreference = 'Continue'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$config = @{
    ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    BackendName = "meet-scribe-backend"
    FrontendName = "meet-scribe"
    BackendUrl = "https://meet-scribe-backend.onrender.com"
    FrontendUrl = "https://meet-scribe.vercel.app"
    RenderRegion = "oregon"
    RenderPlan = "starter"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Write-Header {
    param([string]$Text)
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "$('='*60)`n" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Text)
    Write-Host "▶ $Text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
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

function Confirm-Action {
    param([string]$Action)
    if ($Mode -eq 'auto') { return $true }
    
    $response = Read-Host "Continue with $Action ? (y/n)"
    return $response -eq 'y'
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Prerequisites Check
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Check-Prerequisites {
    Write-Header "🔍 Checking Prerequisites"
    
    $tools = @('render', 'vercel', 'jq')
    $missing = @()
    
    foreach ($tool in $tools) {
        if (Test-ToolExists $tool) {
            Write-Success "$tool CLI found"
        } else {
            Write-Error-Custom "$tool CLI NOT found"
            $missing += $tool
        }
    }
    
    if ($missing) {
        Write-Host "`n❌ Missing tools: $($missing -join ', ')" -ForegroundColor Red
        Write-Host "`nInstall with:`n" -ForegroundColor Yellow
        Write-Host "npm install -g @render-in/render-cli vercel`n"
        exit 1
    }
    
    Write-Success "All prerequisites met"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Setup Environment Variables
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Step-SetupEnv {
    if ($SkipSteps -match 'setup') {
        Write-Host "⊘ Skipping setup..." -ForegroundColor Gray
        return
    }
    
    Write-Header "📝 Step 1/5: Setup Environment Variables"
    
    if (-not (Confirm-Action "environment setup")) { return }
    
    Write-Step "Running setup script..."
    & "$PSScriptRoot/setup-env.ps1" -InteractiveMode:($Mode -eq 'interactive')
    
    Write-Success "Environment variables setup complete"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Validate Credentials
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Step-ValidateCredentials {
    if ($SkipSteps -match 'validate') {
        Write-Host "⊘ Skipping validation..." -ForegroundColor Gray
        return
    }
    
    Write-Header "✓ Step 2/5: Validate Credentials"
    
    Write-Step "Validating all credentials..."
    & "$PSScriptRoot/validate-credentials.ps1" -Verbose:$Verbose
    
    Write-Success "All credentials validated"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Deploy Backend
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Step-DeployBackend {
    if ($SkipSteps -match 'backend') {
        Write-Host "⊘ Skipping backend deployment..." -ForegroundColor Gray
        return
    }
    
    Write-Header "🐍 Step 3/5: Deploy Backend to Render"
    
    if (-not (Confirm-Action "backend deployment to Render")) { return }
    
    Write-Step "Deploying backend..."
    if ($GitHubRepo) {
        & "$PSScriptRoot/deploy-backend.ps1" -GitHubRepo $GitHubRepo -Mode $Mode
    } else {
        & "$PSScriptRoot/deploy-backend.ps1" -Mode $Mode
    }
    
    Write-Success "Backend deployed to Render"
    Write-Host "Backend URL: $($config.BackendUrl)" -ForegroundColor Cyan
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Deploy Frontend
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Step-DeployFrontend {
    if ($SkipSteps -match 'frontend') {
        Write-Host "⊘ Skipping frontend deployment..." -ForegroundColor Gray
        return
    }
    
    Write-Header "⚛️  Step 4/5: Deploy Frontend to Vercel"
    
    if (-not (Confirm-Action "frontend deployment to Vercel")) { return }
    
    Write-Step "Deploying frontend..."
    if ($GitHubRepo) {
        & "$PSScriptRoot/deploy-frontend.ps1" -GitHubRepo $GitHubRepo -BackendUrl $config.BackendUrl -Mode $Mode
    } else {
        & "$PSScriptRoot/deploy-frontend.ps1" -BackendUrl $config.BackendUrl -Mode $Mode
    }
    
    Write-Success "Frontend deployed to Vercel"
    Write-Host "Frontend URL: $($config.FrontendUrl)" -ForegroundColor Cyan
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Verify Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Step-VerifyDeployment {
    if ($SkipSteps -match 'verify') {
        Write-Host "⊘ Skipping verification..." -ForegroundColor Gray
        return
    }
    
    Write-Header "🧪 Step 5/5: Verify Deployment"
    
    Write-Step "Running verification tests..."
    & "$PSScriptRoot/verify-deployment.ps1" -BackendUrl $config.BackendUrl -FrontendUrl $config.FrontendUrl
    
    Write-Success "Deployment verification complete"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Show-Summary {
    Write-Header "📊 Deployment Summary"
    
    Write-Host "✓ Backend: $($config.BackendUrl)" -ForegroundColor Green
    Write-Host "✓ Frontend: $($config.FrontendUrl)" -ForegroundColor Green
    
    Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Visit $($config.FrontendUrl)"
    Write-Host "2. Sign in with Clerk"
    Write-Host "3. Test dashboard functionality"
    Write-Host "4. Monitor logs via Render/Vercel dashboards"
    
    Write-Host "`n📞 Support:" -ForegroundColor Cyan
    Write-Host "• Full guide: DEPLOYMENT.md"
    Write-Host "• Logs: Render dashboard"
    Write-Host "• Logs: Vercel dashboard"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main Execution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n🚀 Meet-Scribe Deployment Automation" -ForegroundColor Magenta
    Write-Host "Mode: $Mode | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -ForegroundColor Gray
    
    Check-Prerequisites
    Step-SetupEnv
    Step-ValidateCredentials
    Step-DeployBackend
    Step-DeployFrontend
    Step-VerifyDeployment
    Show-Summary
    
    Write-Success "`n✨ Deployment complete!")
    exit 0
}
catch {
    Write-Error-Custom "`n💥 Deployment failed: $_"
    Write-Host "`nRun with -Verbose for more details" -ForegroundColor Yellow
    exit 1
}
