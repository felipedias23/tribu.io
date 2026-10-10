import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createCompany } from './support/companies';
import { createTestPrisma } from './support/prisma';
import { createTenant, deleteTenants, type Tenant } from './support/tenants';
import type { NestExpressApplication } from '@nestjs/platform-express';

const DAY = 24 * 60 * 60 * 1000;

/** Tabelas da importação (D34–D37): tenant, unicidades, estados e imutabilidade. */
describe('Modelo da importação (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Importação A');
    b = await createTenant(app, prisma, 'Importação B');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a, b]);
    await prisma.$disconnect();
    await app.close();
  });

  let counter = 0;
  function integration(tenant: Tenant, name = `Origem ${++counter}`) {
    return prisma.integration.create({
      data: { accountingFirmId: tenant.firmId, type: 'FILE', name },
    });
  }

  function batch(
    tenant: Tenant,
    integrationId: string,
    data: Partial<Prisma.ImportBatchUncheckedCreateInput> = {},
  ) {
    const now = Date.now();
    return prisma.importBatch.create({
      data: {
        accountingFirmId: tenant.firmId,
        integrationId,
        createdById: tenant.analyst.id,
        status: 'PREVIEW',
        fileName: 'carteira.csv',
        fileFormat: 'CSV',
        preview: { rows: [] },
        summary: { new: 0 },
        createdAt: new Date(now),
        expiresAt: new Date(now + DAY),
        ...data,
      },
    });
  }

  describe('origens (integrations)', () => {
    it('o nome não se repete no escritório; noutro escritório é aceite', async () => {
      await integration(a, 'Sistema X');

      await expect(integration(a, 'Sistema X')).rejects.toMatchObject({
        code: 'P2002',
      });
      await expect(integration(b, 'Sistema X')).resolves.toBeDefined();
    });

    it.each([
      ['nome em branco', '   '],
      ['nome com mais de 100 caracteres', 'x'.repeat(101)],
    ])('recusa %s', async (_case, name) => {
      await expect(integration(a, name)).rejects.toThrow(
        /integrations_name_not_blank_check/,
      );
    });
  });

  describe('identificadores externos', () => {
    it('um id externo aponta para uma só empresa, e cada empresa tem um id por origem', async () => {
      const origin = await integration(a);
      const [c1, c2] = await Promise.all([
        createCompany(prisma, a.firmId),
        createCompany(prisma, a.firmId),
      ]);
      const map = (companyId: string, externalId: string) =>
        prisma.externalCompanyMapping.create({
          data: {
            accountingFirmId: a.firmId,
            integrationId: origin.id,
            companyId,
            externalId,
          },
        });

      await map(c1.id, 'E-1');
      await expect(map(c2.id, 'E-1')).rejects.toMatchObject({ code: 'P2002' });
      await expect(map(c1.id, 'E-2')).rejects.toMatchObject({ code: 'P2002' });
      await expect(map(c2.id, 'E-2')).resolves.toBeDefined();
    });

    it('o banco recusa ligar uma origem a uma empresa de outro escritório', async () => {
      const origin = await integration(a);
      const foreign = await createCompany(prisma, b.firmId);

      await expect(
        prisma.externalCompanyMapping.create({
          data: {
            accountingFirmId: a.firmId,
            integrationId: origin.id,
            companyId: foreign.id,
            externalId: 'E-9',
          },
        }),
      ).rejects.toThrow(
        /Foreign key constraint|external_company_mappings_company_id/,
      );
    });

    it.each([
      ['id externo em branco', ' '],
      ['id externo com mais de 100 caracteres', 'x'.repeat(101)],
    ])('recusa %s', async (_case, externalId) => {
      const origin = await integration(a);
      const company = await createCompany(prisma, a.firmId);

      await expect(
        prisma.externalCompanyMapping.create({
          data: {
            accountingFirmId: a.firmId,
            integrationId: origin.id,
            companyId: company.id,
            externalId,
          },
        }),
      ).rejects.toThrow(/external_company_mappings_external_id_check/);
    });
  });

  describe('importações (import_batches)', () => {
    it('o banco recusa uma importação com origem ou autor de outro escritório', async () => {
      const foreignOrigin = await integration(b);
      const ownOrigin = await integration(a);

      await expect(batch(a, foreignOrigin.id)).rejects.toThrow(
        /Foreign key constraint|import_batches_integration_id/,
      );
      await expect(
        batch(a, ownOrigin.id, { createdById: b.analyst.id }),
      ).rejects.toThrow(/Foreign key constraint|import_batches_created_by_id/);
    });

    it.each([
      [
        'PREVIEW sem linhas da prévia',
        { preview: Prisma.DbNull },
        'import_batches_preview_status_check',
      ],
      [
        'fechada com linhas da prévia',
        { status: 'CONFIRMED' as const, closedAt: new Date() },
        'import_batches_preview_status_check',
      ],
      [
        'fechada sem data de fecho',
        { status: 'CANCELLED' as const, preview: Prisma.DbNull },
        'import_batches_closed_at_status_check',
      ],
      [
        'PREVIEW com data de fecho',
        { closedAt: new Date() },
        'import_batches_closed_at_status_check',
      ],
      [
        'formato desconhecido',
        { fileFormat: 'ODS' },
        'import_batches_file_format_check',
      ],
      [
        'nome de ficheiro em branco',
        { fileName: ' ' },
        'import_batches_file_name_not_blank_check',
      ],
      [
        'validade antes da criação',
        { expiresAt: new Date(Date.now() - DAY) },
        'import_batches_expires_at_check',
      ],
      [
        'resumo que não é objeto',
        { summary: [1] },
        'import_batches_json_objects_check',
      ],
    ])('recusa %s', async (_case, data, constraint) => {
      const origin = await integration(a);

      await expect(batch(a, origin.id, data)).rejects.toThrow(
        new RegExp(constraint),
      );
    });

    it('uma prévia fecha uma vez; depois de fechada não muda (D37)', async () => {
      const origin = await integration(a);
      const preview = await batch(a, origin.id);

      await prisma.importBatch.update({
        where: { id: preview.id },
        data: {
          status: 'CONFIRMED',
          preview: Prisma.DbNull,
          closedAt: new Date(),
          summary: { new: 3 },
        },
      });

      for (const data of [
        { status: 'CANCELLED' as const },
        { summary: { new: 99 } },
      ]) {
        await expect(
          prisma.importBatch.update({ where: { id: preview.id }, data }),
        ).rejects.toThrow(/uma importação fechada não muda/);
      }
    });
  });
});
