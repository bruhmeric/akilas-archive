#!/bin/sh
set -e

echo "[entrypoint] ensuring database directory exists…"
mkdir -p /app/data 2>/dev/null || true

echo "[entrypoint] applying database schema (prisma db push)…"
node /opt/prisma-cli/node_modules/prisma/build/index.js db push --skip-generate

echo "[entrypoint] starting akilas-archive on port ${PORT:-3000}…"
exec node server.js
