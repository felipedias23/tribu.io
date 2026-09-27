import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaClient } from '../../src/generated/prisma/client';

/** Variáveis do ambiente, completadas pelo .env da raiz em desenvolvimento. */
export function testEnv(): Record<string, string | undefined> {
  try {
    // process.loadEnvFile não alcança o process.env isolado do Jest.
    return { ...parseEnv(readFileSync('../.env', 'utf8')), ...process.env };
  } catch {
    return process.env; // CI: variáveis já definidas no ambiente
  }
}

/**
 * Client ligado ao banco de DATABASE_URL (serviço postgres do CI ou
 * `docker compose up -d db` local, com as migrations já aplicadas).
 */
export function createTestPrisma(): PrismaClient {
  const connectionString = testEnv().DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida para os testes e2e.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
