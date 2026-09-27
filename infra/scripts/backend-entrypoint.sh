#!/bin/sh
# Inicialização do container do backend:
#   1. aplica migrations pendentes (prisma migrate deploy);
#   2. executa o seed de dados fictícios, se SEED_ON_START=true;
#   3. inicia a API.
# O compose só inicia este container depois de o `db` estar saudável.
set -eu

PRISMA="node_modules/.bin/prisma"

echo "[entrypoint] Aplicando migrations..."
"$PRISMA" migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] Executando seed..."
  "$PRISMA" db seed
fi

echo "[entrypoint] Iniciando API..."
exec node dist/main.js
