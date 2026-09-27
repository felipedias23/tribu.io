/**
 * Seed de desenvolvimento: dados fictícios, determinísticos e idempotentes.
 *
 * Executado por `npm run db:seed` (local) e pelo entrypoint do container quando
 * SEED_ON_START=true. Pode correr várias vezes sem duplicar dados: cada registo
 * tem um ID fixo e é atualizado pela sua chave única.
 *
 * As contas criadas estão documentadas em docs/banco-de-dados.md. A password
 * vem de SEED_PASSWORD; nenhuma credencial fica no código.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { databaseUrlSchema, parseOrThrow } from '../config/env.validation';
import { PrismaClient, Role } from '../generated/prisma/client';

/** Escritórios fictícios. Sem CNPJ, para não coincidir com empresas reais. */
export const SEED_FIRMS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Alfa Contabilidade' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Beta Contabilidade' },
] as const;

const [ALFA, BETA] = SEED_FIRMS;

/** Um utilizador por papel em cada escritório. Domínio `.example` (RFC 2606). */
export const SEED_USERS = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    accountingFirmId: ALFA.id,
    name: 'Admin Alfa',
    email: 'admin@alfa.tribu.example',
    role: Role.ADMIN,
  },
  {
    id: '11111111-0000-4000-8000-000000000002',
    accountingFirmId: ALFA.id,
    name: 'Analista Alfa',
    email: 'analista@alfa.tribu.example',
    role: Role.ANALYST,
  },
  {
    id: '11111111-0000-4000-8000-000000000003',
    accountingFirmId: ALFA.id,
    name: 'Consulta Alfa',
    email: 'consulta@alfa.tribu.example',
    role: Role.VIEWER,
  },
  {
    id: '22222222-0000-4000-8000-000000000001',
    accountingFirmId: BETA.id,
    name: 'Admin Beta',
    email: 'admin@beta.tribu.example',
    role: Role.ADMIN,
  },
  {
    id: '22222222-0000-4000-8000-000000000002',
    accountingFirmId: BETA.id,
    name: 'Analista Beta',
    email: 'analista@beta.tribu.example',
    role: Role.ANALYST,
  },
  {
    id: '22222222-0000-4000-8000-000000000003',
    accountingFirmId: BETA.id,
    name: 'Consulta Beta',
    email: 'consulta@beta.tribu.example',
    role: Role.VIEWER,
  },
] as const;

const seedEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  SEED_PASSWORD: z
    .string({ error: 'obrigatória para criar as contas de desenvolvimento' })
    .min(8, 'deve ter pelo menos 8 caracteres'),
});

/**
 * Cria ou atualiza os dados fictícios. A password só é definida na criação:
 * reexecutar o seed não altera o hash nem o `tokenVersion` de contas existentes.
 */
export async function seed(prisma: PrismaClient, password: string) {
  const passwordHashes = await Promise.all(
    SEED_USERS.map(() => argon2.hash(password)),
  );

  await prisma.$transaction(async (tx) => {
    for (const firm of SEED_FIRMS) {
      await tx.accountingFirm.upsert({
        where: { id: firm.id },
        create: firm,
        update: { name: firm.name },
      });
    }

    for (const [index, user] of SEED_USERS.entries()) {
      const { id, email, ...data } = user;
      await tx.user.upsert({
        where: { email },
        create: { id, email, ...data, passwordHash: passwordHashes[index] },
        update: data,
      });
    }
  });

  return { firms: SEED_FIRMS.length, users: SEED_USERS.length };
}

async function main(): Promise<void> {
  const env = parseOrThrow(seedEnvSchema, process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const result = await seed(prisma, env.SEED_PASSWORD);
    console.log(
      `[seed] OK: ${result.firms} escritórios e ${result.users} utilizadores.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[seed] Falhou:', error);
    process.exit(1);
  });
}
