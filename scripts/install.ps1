$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StartScript = Join-Path $ProjectRoot "scripts\start-stride.ps1"
$IconPath = Join-Path $ProjectRoot "docs\assets\stride-icon.svg"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Stride DORA.lnk"

Write-Host ""
Write-Host "Stride DORA - local installation" -ForegroundColor Cyan
Write-Host "Projeto: $ProjectRoot"
Write-Host ""

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Bun nao foi encontrado no PATH." -ForegroundColor Red
  Write-Host "Instale o Bun em https://bun.sh e rode este script novamente."
  exit 1
}

Set-Location $ProjectRoot

Write-Host "Instalando dependencias com Bun..." -ForegroundColor Yellow
bun install

Write-Host "Preparando Electron..." -ForegroundColor Yellow
bun run setup:electron

Write-Host "Criando atalho no Desktop..." -ForegroundColor Yellow
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$StartScript`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Open Stride DORA dashboard"

# Windows .lnk aceita melhor .ico/.exe. O SVG fica documentado e o atalho usa o icone do PowerShell quando nao houver .ico.
if (Test-Path $IconPath) {
  $Shortcut.IconLocation = "powershell.exe,0"
}

$Shortcut.Save()

Write-Host ""
Write-Host "Instalacao concluida." -ForegroundColor Green
Write-Host "Atalho criado em: $ShortcutPath"
Write-Host "Para abrir agora: bun run dev:desktop"
