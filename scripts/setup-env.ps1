#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup environment variables for Meet-Scribe deployment
.DESCRIPTION
    Creates .env and .env.local files from examples and prompts for credentials
.PARAMETER InteractiveMode
    Ask for each credential interactively
.EXAMPLE
    ./setup-env.ps1 -InteractiveMode
    ./setup-env.ps1  # Uses existing values or prompts
#>

param(
    [switch]$InteractiveMode
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"

$EnvFiles = @{
    Backend = @{
        Example = Join-Path $BackendDir ".env.example"
        Target = Join-Path $BackendDir ".env"
        Vars = @(
            'DATABASE_URL', 'CLERK_DOMAIN', 'CLERK_SECRET_KEY', 'CLERK_WEBHOOK_SECRET',
            'GEMINI_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CREDENTIALS_JSON',
            'GCS_BUCKET_NAME', 'UPSTASH_REDIS_URL', 'UPSTASH_REDIS_TOKEN',
            'PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'SENTRY_DSN'
        )
    }
    Frontend = @{
        Example = Join-Path $FrontendDir ".env.local.example"
        Target = Join-Path $FrontendDir ".env.local"
        Vars = @(
            'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_WS_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
            'CLERK_SECRET_KEY', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_SENTRY_DSN'
        )
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Prompt-Credential {
    param(
        [string]$Name,
        [string]$Description,
        [string]$Default = '',
        [switch]$Secret
    )
    
    $prompt = "Enter $Name"
    if ($Description) { $prompt += " ($Description)" }
    if ($Default) { $prompt += " [$Default]" }
    $prompt += ": "
    
    if ($Secret) {
        $value = Read-Host $prompt -AsSecureString
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($value)
        )
    } else {
        $value = Read-Host $prompt
        return $value -or $Default
    }
}

function Copy-EnvTemplate {
    param(
        [string]$ExampleFile,
        [string]$TargetFile
    )
    
    if (Test-Path $TargetFile) {
        $response = Read-Host "$TargetFile already exists. Overwrite? (y/n)"
        if ($response -ne 'y') { return }
    }
    
    Copy-Item $ExampleFile $TargetFile -Force
    Write-Host "✓ Created $TargetFile" -ForegroundColor Green
}

function Update-EnvValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )
    
    if (-not $Value) { return }
    
    $content = Get-Content $FilePath -Raw
    $pattern = "^$Key=.*$"
    $replacement = "$Key=$Value"
    
    $newContent = $content -replace $pattern, $replacement -replace "(?m)^(?=$Key=)", ""
    
    if ($newContent -notmatch "^$Key=") {
        $newContent += "`n$Key=$Value"
    }
    
    Set-Content $FilePath $newContent -NoNewline
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Backend Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Setup-Backend {
    Write-Host "`n📝 Backend Environment (.env)" -ForegroundColor Cyan
    
    $backendConfig = $EnvFiles.Backend
    
    Copy-EnvTemplate $backendConfig.Example $backendConfig.Target
    
    if (-not $InteractiveMode) {
        Write-Host "Edit $($backendConfig.Target) manually with your credentials"
        return
    }
    
    Write-Host "`nEnter backend credentials (leave blank to skip):" -ForegroundColor Yellow
    
    $credentials = @{
        DATABASE_URL = Prompt-Credential "DATABASE_URL" "Supabase PostgreSQL connection string"
        CLERK_DOMAIN = Prompt-Credential "CLERK_DOMAIN" "e.g., app.clerk.accounts.dev"
        CLERK_SECRET_KEY = Prompt-Credential "CLERK_SECRET_KEY" "From Clerk API Keys" -Secret
        CLERK_WEBHOOK_SECRET = Prompt-Credential "CLERK_WEBHOOK_SECRET" "From Clerk Webhooks" -Secret
        GEMINI_API_KEY = Prompt-Credential "GEMINI_API_KEY" "From Google AI Studio" -Secret
        GOOGLE_CLOUD_PROJECT = Prompt-Credential "GOOGLE_CLOUD_PROJECT" "GCP project ID"
        GOOGLE_CREDENTIALS_JSON = Prompt-Credential "GOOGLE_CREDENTIALS_JSON" "(base64-encoded service account JSON)" -Secret
        GCS_BUCKET_NAME = Prompt-Credential "GCS_BUCKET_NAME" "Google Cloud Storage bucket" "meet-scribe-storage"
        UPSTASH_REDIS_URL = Prompt-Credential "UPSTASH_REDIS_URL" "Upstash Redis URL"
        UPSTASH_REDIS_TOKEN = Prompt-Credential "UPSTASH_REDIS_TOKEN" "Upstash Redis token" -Secret
        PINECONE_API_KEY = Prompt-Credential "PINECONE_API_KEY" "Pinecone API key" -Secret
        PINECONE_INDEX_NAME = Prompt-Credential "PINECONE_INDEX_NAME" "Pinecone index name" "meet-scribe"
        SENTRY_DSN = Prompt-Credential "SENTRY_DSN" "Sentry DSN (optional)"
    }
    
    foreach ($key in $credentials.Keys) {
        if ($credentials[$key]) {
            Update-EnvValue $backendConfig.Target $key $credentials[$key]
        }
    }
    
    Write-Host "✓ Backend environment configured" -ForegroundColor Green
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Frontend Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Setup-Frontend {
    Write-Host "`n⚛️  Frontend Environment (.env.local)" -ForegroundColor Cyan
    
    $frontendConfig = $EnvFiles.Frontend
    
    Copy-EnvTemplate $frontendConfig.Example $frontendConfig.Target
    
    if (-not $InteractiveMode) {
        Write-Host "Edit $($frontendConfig.Target) manually with your credentials"
        return
    }
    
    Write-Host "`nEnter frontend credentials (leave blank to skip):" -ForegroundColor Yellow
    
    $credentials = @{
        NEXT_PUBLIC_API_URL = Prompt-Credential "NEXT_PUBLIC_API_URL" "Backend URL" "https://meet-scribe-backend.onrender.com"
        NEXT_PUBLIC_WS_URL = Prompt-Credential "NEXT_PUBLIC_WS_URL" "Backend WebSocket URL" "wss://meet-scribe-backend.onrender.com"
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = Prompt-Credential "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "From Clerk API Keys"
        CLERK_SECRET_KEY = Prompt-Credential "CLERK_SECRET_KEY" "From Clerk API Keys (same as backend)" -Secret
        NEXT_PUBLIC_POSTHOG_KEY = Prompt-Credential "NEXT_PUBLIC_POSTHOG_KEY" "PostHog key (optional)"
        NEXT_PUBLIC_SENTRY_DSN = Prompt-Credential "NEXT_PUBLIC_SENTRY_DSN" "Sentry DSN (optional)"
    }
    
    foreach ($key in $credentials.Keys) {
        if ($credentials[$key]) {
            Update-EnvValue $frontendConfig.Target $key $credentials[$key]
        }
    }
    
    Write-Host "✓ Frontend environment configured" -ForegroundColor Green
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n🔧 Environment Setup for Meet-Scribe" -ForegroundColor Magenta
    if ($InteractiveMode) {
        Write-Host "Mode: Interactive (enter credentials as prompted)" -ForegroundColor Gray
    } else {
        Write-Host "Mode: Copy templates (edit files manually)" -ForegroundColor Gray
    }
    
    Setup-Backend
    Setup-Frontend
    
    Write-Host "`n✓ Environment setup complete!" -ForegroundColor Green
    Write-Host "`n📝 Next: Run ./validate-credentials.ps1 to check all values" -ForegroundColor Cyan
}
catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    exit 1
}
