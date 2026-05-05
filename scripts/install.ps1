$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StartScript  = Join-Path $ProjectRoot "scripts\start-stride.ps1"
$IconIco      = Join-Path $ProjectRoot "build\icon.ico"
$Desktop      = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Stride DORA.lnk"

Write-Host ""
Write-Host "Stride DORA - instalacao local (modo desenvolvedor)" -ForegroundColor Cyan
Write-Host "Diretorio: $ProjectRoot"
Write-Host ""

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Bun nao encontrado no PATH." -ForegroundColor Red
  Write-Host "Instale em https://bun.sh e rode este script novamente."
  exit 1
}

Set-Location $ProjectRoot

Write-Host "Instalando dependencias..." -ForegroundColor Yellow
bun install

Write-Host "Gerando icones..." -ForegroundColor Yellow
node scripts/build-icons.mjs

Write-Host "Preparando Electron..." -ForegroundColor Yellow
bun run setup:electron

Write-Host "Criando atalho no Desktop..." -ForegroundColor Yellow
$Shell    = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)

# Usar wscript.exe para rodar o PS1 sem abrir janela preta de console
$Launcher = Join-Path $ProjectRoot "scripts\start-stride.vbs"
@"
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & "$StartScript" & """", 0, False
"@ | Set-Content -Encoding UTF8 $Launcher

$Shortcut.TargetPath      = "wscript.exe"
$Shortcut.Arguments       = "`"$Launcher`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description     = "Abrir Stride DORA"
$Shortcut.IconLocation    = if (Test-Path $IconIco) { "$IconIco,0" } else { "powershell.exe,0" }
$Shortcut.Save()

Write-Host ""
Write-Host "Instalacao concluida." -ForegroundColor Green
Write-Host "Atalho criado em: $ShortcutPath"
Write-Host "Para abrir agora: bun run dev:desktop"
