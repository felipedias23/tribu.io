import { defineConfig } from 'prisma/config';

// Em desenvolvimento local as variáveis vêm do .env da raiz do monorepo.
// Em containers/CI elas já estão no ambiente e o arquivo não existe.
try {
  process.loadEnvFile('../.env');
} catch {
  // sem .env: usa apenas o ambiente do processo
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // `prisma generate` não precisa de conexão.
    url: process.env.DATABASE_URL ?? '',
  },
});
