#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validate all credentials before deployment
.DESCRIPTION
    Checks that all required credentials exist and have valid format
.PARAMETER Verbose
    Show detailed validation output
.PARAMETER Test
    Test specific credential (e.g., 'supabase', 'clerk', 'google', 'upstash', 'pinecone')
.EXAMPLE
    ./validate-credentials.ps1 -Verbose
    ./validate-credentials.ps1 -Test "supabase"
#>

param(
    [switch]$Verbose,
    [string]$Test = ''
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackendEnv = Join-Path $ProjectRoot "backend" ".env"
$FrontendEnv = Join-Path $ProjectRoot "frontend" ".env.local"

$validations = @()
$passed = 0
$failed = 0

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function Test-Credential {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Pattern = '.+',
        [bool]$Required = $true
    )
    
    if (-not $Value) {
        if ($Required) {
            $validations += @{ Name = $Name; Status = 'MISSING'; Message = 'Credential not set' }
            $failed++
            return $false
        } else {
            $validations += @{ Name = $Name; Status = 'OPTIONAL'; Message = 'Not configured (optional)' }
            return $true
        }
    }
    
    if ($Value -match "^$Pattern`$") {
        $validations += @{ Name = $Name; Status = 'OK'; Message = 'Valid' }
        $passed++
        return $true
    } else {
        $validations += @{ Name = $Name; Status = 'INVALID'; Message = 'Invalid format' }
        $failed++
        return $false
    }
}

function Show-Result {
    param(
        [string]$Name,
        [string]$Status
    )
    
    $colors = @{
        'OK' = 'Green'
        'OPTIONAL' = 'Gray'
        'INVALID' = 'Red'
        'MISSING' = 'Red'
    }
    
    $symbols = @{
        'OK' = '✓'
        'OPTIONAL' = '⊙'
        'INVALID' = '✗'
        'MISSING' = '✗'
    }
    
    Write-Host "$($symbols[$Status]) $Name" -ForegroundColor $colors[$Status] -NoNewline
    if ($Verbose) { Write-Host " [$Status]" -ForegroundColor $colors[$Status] }
    Write-Host ""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Validations
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Validate-Supabase {
    Write-Host "`n🗄️  Supabase (PostgreSQL)" -ForegroundColor Cyan
    
    $dbUrl = Get-EnvValue $BackendEnv "DATABASE_URL"
    Test-Credential "DATABASE_URL" $dbUrl "^postgresql://.*" $true
    Show-Result "DATABASE_URL" (if ($dbUrl) { 'OK' } else { 'MISSING' })
}

function Validate-Clerk {
    Write-Host "`n🔐 Clerk (Authentication)" -ForegroundColor Cyan
    
    $domain = Get-EnvValue $BackendEnv "CLERK_DOMAIN"
    $secret = Get-EnvValue $BackendEnv "CLERK_SECRET_KEY"
    $webhook = Get-EnvValue $BackendEnv "CLERK_WEBHOOK_SECRET"
    $pubKey = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    
    Test-Credential "CLERK_DOMAIN" $domain "^[a-z0-9-]+\.clerk\.accounts\.dev$" $true
    Show-Result "CLERK_DOMAIN" (if ($domain) { 'OK' } else { 'MISSING' })
    
    Test-Credential "CLERK_SECRET_KEY" $secret "^sk_.*" $true
    Show-Result "CLERK_SECRET_KEY" (if ($secret) { 'OK' } else { 'MISSING' })
    
    Test-Credential "CLERK_WEBHOOK_SECRET" $webhook "^whsec_.*" $true
    Show-Result "CLERK_WEBHOOK_SECRET" (if ($webhook) { 'OK' } else { 'MISSING' })
    
    Test-Credential "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" $pubKey "^pk_.*" $true
    Show-Result "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" (if ($pubKey) { 'OK' } else { 'MISSING' })
}

function Validate-GoogleCloud {
    Write-Host "`n🔵 Google Cloud (Speech, Storage, Gemini)" -ForegroundColor Cyan
    
    $project = Get-EnvValue $BackendEnv "GOOGLE_CLOUD_PROJECT"
    $credentials = Get-EnvValue $BackendEnv "GOOGLE_CREDENTIALS_JSON"
    $gemini = Get-EnvValue $BackendEnv "GEMINI_API_KEY"
    $bucket = Get-EnvValue $BackendEnv "GCS_BUCKET_NAME"
    
    Test-Credential "GOOGLE_CLOUD_PROJECT" $project "^[a-z0-9-]+$" $true
    Show-Result "GOOGLE_CLOUD_PROJECT" (if ($project) { 'OK' } else { 'MISSING' })
    
    Test-Credential "GOOGLE_CREDENTIALS_JSON" $credentials ".{100,}" $true
    Show-Result "GOOGLE_CREDENTIALS_JSON" (if ($credentials -and $credentials.Length -gt 100) { 'OK' } else { 'MISSING' })
    
    Test-Credential "GEMINI_API_KEY" $gemini "^AIza.*" $true
    Show-Result "GEMINI_API_KEY" (if ($gemini) { 'OK' } else { 'MISSING' })
    
    Test-Credential "GCS_BUCKET_NAME" $bucket "^[a-z0-9-]+$" $true
    Show-Result "GCS_BUCKET_NAME" (if ($bucket) { 'OK' } else { 'MISSING' })
}

function Validate-Upstash {
    Write-Host "`n⚡ Upstash (Redis)" -ForegroundColor Cyan
    
    $url = Get-EnvValue $BackendEnv "UPSTASH_REDIS_URL"
    $token = Get-EnvValue $BackendEnv "UPSTASH_REDIS_TOKEN"
    
    Test-Credential "UPSTASH_REDIS_URL" $url "^https://.*upstash\.io" $true
    Show-Result "UPSTASH_REDIS_URL" (if ($url) { 'OK' } else { 'MISSING' })
    
    Test-Credential "UPSTASH_REDIS_TOKEN" $token "^AX.*" $true
    Show-Result "UPSTASH_REDIS_TOKEN" (if ($token) { 'OK' } else { 'MISSING' })
}

function Validate-Pinecone {
    Write-Host "`n🌲 Pinecone (Vector DB)" -ForegroundColor Cyan
    
    $apiKey = Get-EnvValue $BackendEnv "PINECONE_API_KEY"
    $indexName = Get-EnvValue $BackendEnv "PINECONE_INDEX_NAME"
    
    Test-Credential "PINECONE_API_KEY" $apiKey "^pcsk_.*" $true
    Show-Result "PINECONE_API_KEY" (if ($apiKey) { 'OK' } else { 'MISSING' })
    
    Test-Credential "PINECONE_INDEX_NAME" $indexName ".+" $true
    Show-Result "PINECONE_INDEX_NAME" (if ($indexName) { 'OK' } else { 'MISSING' })
}

function Validate-Frontend {
    Write-Host "`n⚛️  Frontend Configuration" -ForegroundColor Cyan
    
    $apiUrl = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_API_URL"
    $wsUrl = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_WS_URL"
    $clerkSecret = Get-EnvValue $FrontendEnv "CLERK_SECRET_KEY"
    
    Test-Credential "NEXT_PUBLIC_API_URL" $apiUrl "^https://.*" $true
    Show-Result "NEXT_PUBLIC_API_URL" (if ($apiUrl) { 'OK' } else { 'MISSING' })
    
    Test-Credential "NEXT_PUBLIC_WS_URL" $wsUrl "^wss://.*" $true
    Show-Result "NEXT_PUBLIC_WS_URL" (if ($wsUrl) { 'OK' } else { 'MISSING' })
    
    Test-Credential "CLERK_SECRET_KEY" $clerkSecret "^sk_.*" $true
    Show-Result "CLERK_SECRET_KEY" (if ($clerkSecret) { 'OK' } else { 'MISSING' })
}

function Validate-Optional {
    Write-Host "`n📊 Optional Services" -ForegroundColor DarkGray
    
    $sentry = Get-EnvValue $BackendEnv "SENTRY_DSN"
    $posthog = Get-EnvValue $FrontendEnv "NEXT_PUBLIC_POSTHOG_KEY"
    
    Test-Credential "SENTRY_DSN" $sentry "^https://.*sentry\.io.*" $false
    Show-Result "SENTRY_DSN" (if ($sentry) { 'OK' } else { 'OPTIONAL' })
    
    Test-Credential "NEXT_PUBLIC_POSTHOG_KEY" $posthog ".+" $false
    Show-Result "NEXT_PUBLIC_POSTHOG_KEY" (if ($posthog) { 'OK' } else { 'OPTIONAL' })
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n✓ Credential Validation" -ForegroundColor Magenta
    
    if (-not (Test-Path $BackendEnv)) {
        Write-Host "✗ Backend .env not found: $BackendEnv" -ForegroundColor Red
        exit 1
    }
    
    if (-not (Test-Path $FrontendEnv)) {
        Write-Host "✗ Frontend .env.local not found: $FrontendEnv" -ForegroundColor Red
        exit 1
    }
    
    if ($Test) {
        switch ($Test) {
            'supabase' { Validate-Supabase }
            'clerk' { Validate-Clerk }
            'google' { Validate-GoogleCloud }
            'upstash' { Validate-Upstash }
            'pinecone' { Validate-Pinecone }
            'frontend' { Validate-Frontend }
            'optional' { Validate-Optional }
            default { Write-Host "Unknown test: $Test" -ForegroundColor Red; exit 1 }
        }
    } else {
        Validate-Supabase
        Validate-Clerk
        Validate-GoogleCloud
        Validate-Upstash
        Validate-Pinecone
        Validate-Frontend
        Validate-Optional
    }
    
    Write-Host "`n$('='*50)" -ForegroundColor Cyan
    Write-Host "Results: $passed passed, $failed failed" -ForegroundColor Cyan
    Write-Host "$('='*50)" -ForegroundColor Cyan
    
    if ($failed -gt 0) {
        Write-Host "`n✗ Validation failed. Fix missing credentials before deploying." -ForegroundColor Red
        Write-Host "Edit: ./backend/.env and ./frontend/.env.local" -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "`n✓ All credentials validated!" -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "✗ Validation error: $_" -ForegroundColor Red
    exit 1
}
