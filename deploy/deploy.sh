#!/usr/bin/env bash
# ============================================================================
# Akila's Archive — deploy / update script
#
# Usage (from anywhere):
#   bash deploy/deploy.sh
#
# What it does:
#   1. Verifies .env exists (creates it from the example on first run)
#   2. Creates the ./data volume dir with correct ownership (uid 1001)
#   3. Builds + starts the app container (and optionally Caddy via profile)
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

echo "==> Akila's Archive deploy"
echo "    repo root: $(pwd)"

# 1. .env check
if [ ! -f .env ]; then
  cp deploy/.env.example .env
  echo "!!  Created .env from deploy/.env.example"
  echo "!!  Edit it now (R2 account id, admin password, session secret):"
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

# 3. build & start (add --profile proxy to include Caddy)
PROXY_FLAG=""
if [ "${1:-}" = "--with-caddy" ]; then
  PROXY_FLAG="--profile proxy"
  echo "==> Starting app + Caddy reverse proxy (profile: proxy)"
else
  echo "==> Starting app only (Caddy assumed to run on the host or already configured)"
fi

docker compose -f deploy/docker-compose.yml up -d --build $PROXY_FLAG

echo ""
echo "==> Done. Containers:"
docker compose -f deploy/docker-compose.yml ps
echo ""
echo "    App (direct):      http://<vps-ip>:3001"
if [ -n "$PROXY_FLAG" ]; then
  echo "    App (via Caddy):   https://akilasarchive.site   (once DNS points here)"
fi
echo "    Admin panel:       http://<vps-ip>:3001/admin"
echo ""
echo "    Useful commands:"
echo "      logs:    docker compose -f deploy/docker-compose.yml logs -f archive"
echo "      restart: docker compose -f deploy/docker-compose.yml restart archive"
echo "      update:  git pull && bash deploy/deploy.sh"
