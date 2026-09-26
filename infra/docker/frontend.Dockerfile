# syntax=docker/dockerfile:1
# SPA React servida por nginx, que também faz proxy de /api para o backend.
# Contexto de build: raiz do monorepo.

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Imagem oficial do nginx sem root (escuta na porta 8080).
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
