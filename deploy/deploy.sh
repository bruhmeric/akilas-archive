#!/usr/bin/env bash
# ============================================================================
# Akila's Archive — deploy / update script
#
# Usage (from anywhere):
#   bash deploy/deploy.sh                # app only
#   bash deploy/deploy.sh --with-caddy   # app + bundled Caddy (auto-HTTPS)
#   bash deploy/deploy.sh --app-only     # same as default, explicit
#
# What it does:
#   1. Verifies .env exists (creates it from the example on first run)
#   2. Creates the ./data volume dir with correct ownership (uid 1001)
#   3. Builds + starts the containers via docker compose
#
# Compatibility notes:
#   - Works with `docker compose` (v2 plugin) AND the standalone/legacy
#     `docker-compose` binary — it auto-detects whichever exists.
#   - No `--profile` flag is used (not available in older compose versions);
#     the optional Caddy service lives in docker-compose.caddy.yml and is
#     included via compose's `-f` file overlay, supported everywhere.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

echo "==> Akila's Archive deploy"
echo "    repo root: $(pwd)"

# ----------------------------------------------------------------------------
# 0. pick a working compose command
# ----------------------------------------------------------------------------
COMPOSE=()
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "!!  No Docker Compose found."
  echo "!!  Install the compose plugin:"
  echo "!!      apt-get update && apt-get install -y docker-compose-plugin"
  echo "!!  (or the standalone binary: https://docs.docker.com/compose/install/)"
  exit 1
fi
echo "==> Using compose: ${COMPOSE[*]} ($(${COMPOSE[*]} version --short 2>/dev/null || ${COMPOSE[*]} version 2>/dev/null || echo 'unknown version'))"

# Base + optional overlay files (relative to repo root)
FILE_ARGS=(-f deploy/docker-compose.yml)
START_MODE="app only"

for arg in "$@"; do
  case "$arg" in
    --with-caddy)
      FILE_ARGS+=(-f deploy/docker-compose.caddy.yml)
      START_MODE="app + Caddy reverse proxy"
      ;;
    --app-only) ;;
    -h|--help)
      echo "Usage: bash deploy/deploy.sh [--with-caddy|--app-only]"
      exit 0
      ;;
    *)
      echo "!!  Unknown option: $arg (supported: --with-caddy, --app-only)"
      exit 1
      ;;
  esac
done

# 1. .env check
if [ ! -f .env ]; then
  cp deploy/.env.example .env
  echo "!!  Created .env from deploy/.env.example"
  echo "!!  Edit it now (storage account id, admin password, session secret):"
  echo "!!      nano .env"
  exit 1
fi

# 2. data dir + ownership for the container's non-root user (uid 1001)
mkdir -p data
if [ "$(id -u)" = "0" ]; then
  chown -R 1001:1001 data || true
else
  sudo chown -R 1001:1001 data 2>/dev/null || \
    echo "!!  Could not chown ./data — if the container fails to write the DB, run:"
    echo "!!      sudo chown -R 1001:1001 $(pwd)/data"
fi

# 3. build & start
echo "==> Starting $START_MODE"
"${COMPOSE[@]}" -p akilas-archive "${FILE_ARGS[@]}" up -d --build

echo ""
echo "==> Done. Containers:"
"${COMPOSE[@]}" -p akilas-archive "${FILE_ARGS[@]}" ps
echo ""
echo "    App (direct):      http://<vps-ip>:3001"
if [ "$START_MODE" != "app only" ]; then
  echo "    App (via Caddy):   https://akilasarchive.site   (once DNS points here)"
fi
echo "    Admin panel:       http://<vps-ip>:3001/admin"
echo ""
echo "    Useful commands:"
echo "      logs:    ${COMPOSE[*]} -p akilas-archive ${FILE_ARGS[*]} logs -f archive"
echo "      restart: ${COMPOSE[*]} -p akilas-archive ${FILE_ARGS[*]} restart archive"
echo "      down:    ${COMPOSE[*]} -p akilas-archive ${FILE_ARGS[*]} down"
echo "      update:  git pull && bash deploy/deploy.sh"
