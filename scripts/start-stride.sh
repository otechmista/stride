#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  printf '%s\n' "Bun not found. Install it from https://bun.sh and run scripts/install.sh again." >&2
  exit 1
fi

exec bun run dev:desktop
