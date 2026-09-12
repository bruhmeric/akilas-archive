# syntax=docker/dockerfile:1

########################################################################
# Akila's Archive — production image
#
# Multi-stage build:
#   deps     : install JS dependencies with bun (frozen lockfile)
#   builder  : prisma generate + next build (standalone output)
#   prisma-cli: small toolchain image that provides the prisma CLI used
#               at container startup to apply the SQLite schema
#   runner   : minimal node runtime with the standalone Next.js server
########################################################################

######################## deps ########################
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

######################## builder ########################
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

######################## prisma cli (for startup db push) ########################
FROM node:20-slim AS prisma-cli
RUN npm install --prefix /opt/prisma-cli prisma@6

######################## runner ########################
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1001 nodejs \
 && useradd --uid 1001 --gid nodejs --shell /bin/sh --create-home nextjs

# Standalone Next.js server (includes traced node_modules + static assets)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app
# Prisma schema + generated client engines (used by db push at startup)
COPY --from=builder --chown=nextjs:nodejs /app/prisma /app/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma /app/node_modules/@prisma
# Prisma CLI for "db push" on boot
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli
# Entrypoint
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data \
 && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
