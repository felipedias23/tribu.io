# syntax=docker/dockerfile:1
# API NestJS. Contexto de build: raiz do monorepo.

FROM node:22-alpine AS base
# openssl: exigido pelo schema engine do Prisma (migrations) no Alpine.
RUN apk add --no-cache openssl
WORKDIR /app

# ─── Build: dependências completas, client Prisma e compilação ───
FROM base AS build
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
# `postinstall` executa `prisma generate`.
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# ─── Runtime: apenas artefatos de produção, usuário sem privilégios ───
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Migrations e config do Prisma, usadas pelo entrypoint (migrate deploy + seed).
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
COPY --chmod=755 infra/scripts/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
