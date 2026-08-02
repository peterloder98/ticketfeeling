#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

if ! psql -d ticketfeeling -c "SELECT 1" >/dev/null 2>&1; then
  echo "PostgreSQL/DB 'ticketfeeling' nicht erreichbar."
  echo "Starte z. B.: brew services start postgresql@16 && createdb ticketfeeling"
  exit 1
fi

if ! redis-cli ping >/dev/null 2>&1; then
  echo "Redis nicht erreichbar — starte lokalen Redis (optional für Phase 0)…"
  redis-server --daemonize yes --port 6379 || true
fi

cd "$ROOT/apps/web"
npm run dev
