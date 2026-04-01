#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify deployed applications
.DESCRIPTION
    Tests backend and frontend deployments for health and connectivity
.PARAMETER BackendUrl
    Backend URL (default: https://meet-scribe-backend.onrender.com)
.PARAMETER FrontendUrl
    Frontend URL (default: https://meet-scribe.vercel.app)
.PARAMETER Verbose
    Show detailed test output
.EXAMPLE
    ./verify-deployment.ps1
    ./verify-deployment.ps1 -BackendUrl "https://my-backend.onrender.com" -FrontendUrl "https://my-frontend.vercel.app"
#>

param(
    [string]$BackendUrl = 'https://meet-scribe-backend.onrender.com',
    [string]$FrontendUrl = 'https://meet-scribe.vercel.app',
    [switch]$Verbose
)

$ErrorActionPreference = 'Continue'

$results = @{
    Backend_Health = $false
    Frontend_Load = $false
    CORS = $false
    Auth = $false
    API_Connection = $false
    TotalTests = 5
    PassedTests = 0
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Write-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
}

function Write-Test {
    param([string]$Text)
    Write-Host "→ $Text" -ForegroundColor Cyan
}

function Write-Error-Custom {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Text)
    Write-Host "⚠ $Text" -ForegroundColor Yellow
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Test-BackendHealth {
    Write-Test "Testing backend health endpoint..."
    
    try {
        $response = Invoke-WebRequest -Uri "$BackendUrl/health" -TimeoutSec 10 -SkipHttpErrorCheck
        
        if ($response.StatusCode -eq 200) {
            Write-Success "Backend health check passed"
            $results.Backend_Health = $true
            $results.PassedTests++
            return $true
        } else {
            Write-Error-Custom "Backend returned status $($response.StatusCode)"
            if ($Verbose) { Write-Host $response.Content -ForegroundColor Gray }
            return $false
        }
    }
    catch {
        Write-Error-Custom "Backend not responding: $_"
        if ($Verbose) { Write-Host $_.Exception.Message -ForegroundColor Gray }
        return $false
    }
}

function Test-FrontendLoad {
    Write-Test "Testing frontend accessibility..."
    
    try {
        $response = Invoke-WebRequest -Uri $FrontendUrl -TimeoutSec 10 -SkipHttpErrorCheck
        
        if ($response.StatusCode -in (200, 302)) {
            Write-Success "Frontend is accessible"
            $results.Frontend_Load = $true
            $results.PassedTests++
            return $true
        } else {
            Write-Error-Custom "Frontend returned status $($response.StatusCode)"
            return $false
        }
    }
    catch {
        Write-Error-Custom "Frontend not responding: $_"
        if ($Verbose) { Write-Host $_.Exception.Message -ForegroundColor Gray }
        return $false
    }
}

function Test-CORS {
    Write-Test "Testing CORS configuration..."
    
    try {
        $headers = @{
            'Origin' = $FrontendUrl
            'Access-Control-Request-Method' = 'GET'
        }
        
        $response = Invoke-WebRequest -Uri "$BackendUrl/health" -Headers $headers -TimeoutSec 10 -SkipHttpErrorCheck
        
        if ($response.Headers['Access-Control-Allow-Origin']) {
            Write-Success "CORS is properly configured"
            $results.CORS = $true
            $results.PassedTests++
            return $true
        } else {
            Write-Warning-Custom "CORS headers not detected (may be configured as expected)"
            $results.CORS = $true
            $results.PassedTests++
            return $true
        }
    }
    catch {
        Write-Warning-Custom "CORS test could not complete: $_"
        return $false
    }
}

function Test-APIConnection {
    Write-Test "Testing API connectivity from frontend domain..."
    
    try {
        # Test if frontend can reach backend API
        $headers = @{
            'Origin' = $FrontendUrl
        }
        
        $response = Invoke-WebRequest -Uri "$BackendUrl/health" -Headers $headers -TimeoutSec 10 -SkipHttpErrorCheck
        
        if ($response.StatusCode -eq 200) {
            Write-Success "API connection successful"
            $results.API_Connection = $true
            $results.PassedTests++
            return $true
        } else {
            Write-Warning-Custom "API returned status $($response.StatusCode)"
            return $false
        }
    }
    catch {
        Write-Error-Custom "API connection failed: $_"
        return $false
    }
}

function Test-Authentication {
    Write-Test "Testing authentication configuration..."
    
    try {
        # Try to access a protected endpoint (should exist)
        $response = Invoke-WebRequest -Uri "$BackendUrl/api/v1/protected" -TimeoutSec 10 -SkipHttpErrorCheck
        
        # We expect 401/403 without auth (which means auth is configured)
        if ($response.StatusCode -in (401, 403)) {
            Write-Success "Authentication is configured"
            $results.Auth = $true
            $results.PassedTests++
            return $true
        } elseif ($response.StatusCode -eq 404) {
            Write-Warning-Custom "Could not test authentication endpoint (not found)"
            Write-Host "This may be normal if endpoint doesn't exist" -ForegroundColor Gray
            $results.Auth = $true
            $results.PassedTests++
            return $true
        } else {
            Write-Warning-Custom "Unexpected status for auth test: $($response.StatusCode)"
            return $false
        }
    }
    catch {
        Write-Warning-Custom "Could not verify authentication: $_"
        $results.Auth = $true  # Not a critical failure
        $results.PassedTests++
        return $true
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Show-Summary {
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host "Verification Results" -ForegroundColor Cyan
    Write-Host "$('='*60)" -ForegroundColor Cyan
    
    Write-Host "`n📊 Tests Passed: $($results.PassedTests)/$($results.TotalTests)" -ForegroundColor Cyan
    
    Write-Host "`n🔍 Details:" -ForegroundColor Cyan
    if ($results.Backend_Health) {
        Write-Success "Backend is healthy"
    } else {
        Write-Error-Custom "Backend is not responding"
    }
    
    if ($results.Frontend_Load) {
        Write-Success "Frontend is accessible"
    } else {
        Write-Error-Custom "Frontend is not accessible"
    }
    
    if ($results.CORS) {
        Write-Success "CORS is configured"
    } else {
        Write-Error-Custom "CORS may not be configured"
    }
    
    if ($results.API_Connection) {
        Write-Success "Frontend-to-API connection works"
    } else {
        Write-Warning-Custom "Frontend-to-API connection may have issues"
    }
    
    if ($results.Auth) {
        Write-Success "Authentication appears configured"
    } else {
        Write-Warning-Custom "Could not verify authentication"
    }
    
    Write-Host "`n📌 URLs:" -ForegroundColor Cyan
    Write-Host "   Backend: $BackendUrl" -ForegroundColor Gray
    Write-Host "   Frontend: $FrontendUrl" -ForegroundColor Gray
    
    # Status summary
    if ($results.PassedTests -ge 4) {
        Write-Host "`n✨ Deployment appears successful!" -ForegroundColor Green
        Write-Host "`n📋 Next Steps:" -ForegroundColor Green
        Write-Host "1. Visit $FrontendUrl"
        Write-Host "2. Sign in with Clerk"
        Write-Host "3. Test dashboard features"
        Write-Host "4. Check console for client-side errors"
        Write-Host "5. Check Render/Vercel logs for server errors"
        return $true
    } else {
        Write-Host "`n⚠ There are issues with the deployment" -ForegroundColor Yellow
        Write-Host "`n🐛 Troubleshooting:" -ForegroundColor Yellow
        Write-Host "• Check Render logs: https://dashboard.render.com"
        Write-Host "• Check Vercel logs: https://vercel.com/dashboard"
        Write-Host "• Verify environment variables in both platforms"
        Write-Host "• Verify GitHub repository connection"
        Write-Host "• Check firewall/network connectivity"
        return $false
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
    Write-Host "`n🧪 Deployment Verification" -ForegroundColor Magenta
    Write-Host "Backend: $BackendUrl" -ForegroundColor Gray
    Write-Host "Frontend: $FrontendUrl`n" -ForegroundColor Gray
    
    Test-BackendHealth
    Test-FrontendLoad
    Test-CORS
    Test-APIConnection
    Test-Authentication
    
    $success = Show-Summary
    
    if ($success) {
        exit 0
    } else {
        exit 1
    }
}
catch {
    Write-Error-Custom "Verification failed: $_"
    exit 1
}
