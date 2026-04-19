$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UpdateScript = Join-Path $ScriptDir "scripts\update-data.mjs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js was not found. Install Node.js or add node to PATH."
}

Write-Host "Updating Ozon category rates, logistics prices, and exchange rates..." -ForegroundColor Cyan
node $UpdateScript

if ($LASTEXITCODE -ne 0) {
    throw "Pricing data update failed."
}

Write-Host "Update completed." -ForegroundColor Green
Write-Host "Output directory: $ScriptDir\data"
