$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Bun not found. Install it from https://bun.sh and run scripts/install.ps1 again." -ForegroundColor Red
  exit 1
}

bun run dev:desktop
