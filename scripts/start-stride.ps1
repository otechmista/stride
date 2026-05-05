$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  [System.Windows.Forms.MessageBox]::Show(
    "Bun nao encontrado.`nInstale em https://bun.sh e rode scripts\install.ps1 novamente.",
    "Stride DORA",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
  exit 1
}

bun run dev:desktop
