#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pull-based deploy for the lab server.
#
# Call this from SSH (`bash scripts/deploy.sh`) or from cron.  It is safe to
# run on a clean checkout: exits 0 without restarting if HEAD already matches
# origin/main.
#
# Environment:
#   ALL_PROXY / http_proxy / https_proxy  — set if github requires a proxy
#   NODE_BIN                               — override node binary path
#   PORT                                   — defaults to 7878
#
# Process manager: uses pm2 if installed, else falls back to nohup + killall.
# Neither option requires sudo.
# ---------------------------------------------------------------------------
set -euo pipefail

# Resolve repo root regardless of where the script was invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

PORT="${PORT:-7878}"
LOG_PREFIX="[deploy $(date -Iseconds)]"

log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

# --- 1. fetch ---------------------------------------------------------------
log "fetching origin/main"
git fetch --quiet origin main || fail "git fetch failed (check proxy / credentials)"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [ "$LOCAL" = "$REMOTE" ]; then
  log "already at $LOCAL, nothing to do"
  exit 0
fi

log "pulling: $LOCAL → $REMOTE"
git reset --hard origin/main

# --- 2. install / build -----------------------------------------------------
# Only run `npm ci` if package-lock changed, saves ~20s on most deploys.
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '^(package\.json|package-lock\.json)$'; then
  log "package files changed → npm ci"
  npm ci --no-audit --no-fund
else
  log "deps unchanged → skipping npm ci"
fi

log "npm run build"
npm run build

# --- 3. restart -------------------------------------------------------------
if command -v pm2 >/dev/null 2>&1; then
  log "pm2 reload"
  pm2 startOrReload "$REPO_ROOT/ecosystem.config.cjs" --only coc
  pm2 save
else
  log "pm2 not found; falling back to kill + nohup"
  bash "$REPO_ROOT/scripts/start-prod.sh"
fi

log "done"
