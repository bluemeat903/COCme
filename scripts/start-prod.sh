#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fallback process manager for when pm2 isn't available.  Kills any existing
# Next.js bound to $PORT on this host (we can only see processes of our own
# uid, which is fine), then starts `next start` detached via nohup.
#
# Restart persistence across reboots: add a user crontab `@reboot` entry
# pointing at this script.  See docs/DEPLOY.md.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

PORT="${PORT:-7878}"
LOG_FILE="${LOG_FILE:-$REPO_ROOT/prod.log}"

# Find any process of our uid listening on $PORT.
OLD_PID=$(ss -tlnp 2>/dev/null | awk -v p=":$PORT" '$0 ~ p { match($0,/pid=([0-9]+)/,m); print m[1]; exit }' || true)

if [ -n "${OLD_PID:-}" ]; then
  echo "[start-prod] killing existing pid=$OLD_PID on :$PORT"
  kill -TERM "$OLD_PID" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then break; fi
    sleep 1
  done
  if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "[start-prod] forcing kill"
    kill -KILL "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

echo "[start-prod] starting next start on 0.0.0.0:$PORT"
# `--env-file-if-exists` so .env.local auto-loads
nohup node --env-file-if-exists=.env.local "$(npm bin 2>/dev/null)/next" start -p "$PORT" -H 0.0.0.0 \
  >> "$LOG_FILE" 2>&1 &
disown
echo "[start-prod] launched pid=$! (logs: $LOG_FILE)"
