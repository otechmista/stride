#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
START_SCRIPT="$PROJECT_ROOT/scripts/start-stride.sh"
ICON_PATH="$PROJECT_ROOT/docs/assets/stride-icon.svg"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/stride-dora.desktop"
APP_FILE="$APP_DIR/stride-dora.desktop"

printf '\n%s\n' "Stride DORA - local installation"
printf '%s\n\n' "Projeto: $PROJECT_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  printf '%s\n' "Bun nao foi encontrado no PATH." >&2
  printf '%s\n' "Instale o Bun em https://bun.sh e rode este script novamente." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

printf '%s\n' "Instalando dependencias com Bun..."
bun install

printf '%s\n' "Preparando Electron..."
bun run setup:electron

chmod +x "$START_SCRIPT"

mkdir -p "$APP_DIR"
mkdir -p "$DESKTOP_DIR"

cat > "$APP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Stride DORA
Comment=Dashboard desktop de metricas DORA com Jira, GitHub e SQLite
Exec=$START_SCRIPT
Icon=$ICON_PATH
Terminal=false
Categories=Development;ProjectManagement;
StartupNotify=true
EOF

cp "$APP_FILE" "$DESKTOP_FILE"
chmod +x "$APP_FILE" "$DESKTOP_FILE"

printf '\n%s\n' "Instalacao concluida."
printf '%s\n' "Launcher criado em: $DESKTOP_FILE"
printf '%s\n' "Menu do sistema: $APP_FILE"
printf '%s\n' "Para abrir agora: bun run dev:desktop"
