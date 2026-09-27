import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { SEED_FIRMS, SEED_USERS, seed } from '../src/prisma/seed';
import { createTestPrisma, testEnv } from './support/prisma';

// Testes de persistência contra PostgreSQL real, com as migrations aplicadas
// (`npm run db:migrate:deploy`). Cada teste cria os seus próprios escritórios
// e remove-os no fim; os dados do seed não são apagados.
describe('Banco de dados (e2e)', () => {
  let prisma: PrismaClient;
  const createdFirmIds: string[] = [];

  async function createFirm(name = 'Escritório de teste') {
    const firm = await prisma.accountingFirm.create({ data: { name } });
    createdFirmIds.push(firm.id);
    return firm;
  }

  function userData(accountingFirmId: string, email = uniqueEmail()) {
    return {
      accountingFirmId,
      email,
      name: 'Utilizador de teste',
      passwordHash: 'not-a-real-hash',
      role: Role.ANALYST,
    };
  }

  function uniqueEmail() {
    return `teste-${randomUUID()}@tribu.example`;
  }

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { accountingFirmId: { in: createdFirmIds } },
    });
    await prisma.accountingFirm.deleteMany({
      where: { id: { in: createdFirmIds } },
    });
    await prisma.$disconnect();
  });

  describe('migrations', () => {
    it('aplicou todas as migrations versionadas no repositório', async () => {
      const inRepository = readdirSync(
        join(__dirname, '..', 'prisma', 'migrations'),
        { withFileTypes: true },
      )
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

      const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name`;

      expect(inRepository.length).toBeGreaterThan(0);
      expect(applied.map((row) => row.migration_name)).toEqual(inRepository);
    });

    it('criou o enum de papéis com ADMIN, ANALYST e VIEWER', async () => {
      const labels = await prisma.$queryRaw<{ label: string }[]>`
        SELECT e.enumlabel AS label FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'role' ORDER BY e.enumsortorder`;

      expect(labels.map((row) => row.label)).toEqual([
        'ADMIN',
        'ANALYST',
        'VIEWER',
      ]);
    });

    it('criou as restrições de integridade e o índice por tenant', async () => {
      const constraints = await prisma.$queryRaw<{ name: string }[]>`
        SELECT conname AS name FROM pg_constraint
        WHERE conrelid IN ('accounting_firms'::regclass, 'users'::regclass)
          AND contype IN ('c', 'f')
        ORDER BY conname`;
      const indexes = await prisma.$queryRaw<{ name: string }[]>`
        SELECT indexname AS name FROM pg_indexes WHERE tablename = 'users'`;

      expect(constraints.map((row) => row.name)).toEqual([
        'accounting_firms_cnpj_format_check',
        'accounting_firms_name_not_blank_check',
        'users_accounting_firm_id_fkey',
        'users_email_lowercase_check',
        'users_name_not_blank_check',
        'users_token_version_non_negative_check',
      ]);
      expect(indexes.map((row) => row.name)).toContain(
        'users_accounting_firm_id_idx',
      );
    });
  });

  describe('unicidade e formato', () => {
    it('rejeita email repetido, mesmo em outro escritório', async () => {
      const [alfa, beta] = [await createFirm(), await createFirm()];
      const email = uniqueEmail();
      await prisma.user.create({ data: userData(alfa.id, email) });

      await expect(
        prisma.user.create({ data: userData(beta.id, email) }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejeita email com maiúsculas', async () => {
      const firm = await createFirm();

      await expect(
        prisma.user.create({
          data: userData(firm.id, `Maiusculas-${randomUUID()}@tribu.example`),
        }),
      ).rejects.toThrow(/users_email_lowercase_check/);
    });

    it('rejeita CNPJ repetido e CNPJ fora do formato', async () => {
      // Sufixo aleatório para não colidir entre execuções.
      const cnpj = `TST${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}00`;
      const firm = await prisma.accountingFirm.create({
        data: { name: 'Com CNPJ', cnpj },
      });
      createdFirmIds.push(firm.id);

      await expect(
        prisma.accountingFirm.create({ data: { name: 'Duplicado', cnpj } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.accountingFirm.create({
          data: { name: 'Pontuado', cnpj: '12.345.678/01' },
        }),
      ).rejects.toThrow(/accounting_firms_cnpj_format_check/);
    });

    it('rejeita tokenVersion negativo', async () => {
      const firm = await createFirm();

      await expect(
        prisma.user.create({
          data: { ...userData(firm.id), tokenVersion: -1 },
        }),
      ).rejects.toThrow(/users_token_version_non_negative_check/);
    });
  });

  describe('integridade entre tenants', () => {
    it('rejeita utilizador ligado a um escritório inexistente', async () => {
      await expect(
        prisma.user.create({ data: userData(randomUUID()) }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('impede apagar um escritório que ainda tem utilizadores', async () => {
      const firm = await createFirm();
      await prisma.user.create({ data: userData(firm.id) });

      await expect(
        prisma.accountingFirm.delete({ where: { id: firm.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('consultas filtradas pelo tenant não devolvem utilizadores de outro escritório', async () => {
      const [alfa, beta] = [await createFirm(), await createFirm()];
      await prisma.user.create({ data: userData(alfa.id) });
      const betaUser = await prisma.user.create({ data: userData(beta.id) });

      const found = await prisma.user.findFirst({
        where: { id: betaUser.id, accountingFirmId: alfa.id },
      });

      expect(found).toBeNull();
    });
  });

  describe('seed', () => {
    const seedEmails = SEED_USERS.map((user) => user.email);
    const password = testEnv().SEED_PASSWORD;
    if (!password) {
      throw new Error('SEED_PASSWORD não definida para os testes e2e.');
    }

    function snapshot() {
      return prisma.user.findMany({
        where: { email: { in: seedEmails } },
        select: {
          id: true,
          email: true,
          role: true,
          accountingFirmId: true,
          passwordHash: true,
        },
        orderBy: { email: 'asc' },
      });
    }

    it('é idempotente: executar duas vezes não duplica nem altera dados', async () => {
      await seed(prisma, password);
      const first = await snapshot();

      await seed(prisma, password);
      const second = await snapshot();

      expect(first).toHaveLength(SEED_USERS.length);
      expect(second).toEqual(first);
      expect(
        await prisma.accountingFirm.count({
          where: { id: { in: SEED_FIRMS.map((firm) => firm.id) } },
        }),
      ).toBe(SEED_FIRMS.length);
    });

    it('cria um utilizador de cada papel em cada escritório, com password em hash', async () => {
      const users = await snapshot();

      for (const firm of SEED_FIRMS) {
        const roles = users
          .filter((user) => user.accountingFirmId === firm.id)
          .map((user) => user.role)
          .sort();
        expect(roles).toEqual([Role.ADMIN, Role.ANALYST, Role.VIEWER]);
      }
      for (const user of users) {
        expect(user.passwordHash).toMatch(/^\$argon2id\$/);
        expect(user.passwordHash).not.toContain(password);
      }
    });
  });
});
