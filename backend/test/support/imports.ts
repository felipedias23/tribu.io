import { PrismaClient } from '../../src/generated/prisma/client';
import type { Tenant } from './tenants';

const DAY = 24 * 60 * 60 * 1000;

/** Grava diretamente uma prévia vazia, para testes que só precisam de que ela exista. */
export async function createImportBatch(prisma: PrismaClient, tenant: Tenant) {
  const integration = await prisma.integration.upsert({
    where: {
      accountingFirmId_type_name: {
        accountingFirmId: tenant.firmId,
        type: 'FILE',
        name: 'Origem de teste',
      },
    },
    create: {
      accountingFirmId: tenant.firmId,
      type: 'FILE',
      name: 'Origem de teste',
    },
    update: {},
  });
  const now = Date.now();
  return prisma.importBatch.create({
    data: {
      accountingFirmId: tenant.firmId,
      integrationId: integration.id,
      createdById: tenant.analyst.id,
      status: 'PREVIEW',
      fileName: 'carteira.csv',
      fileFormat: 'CSV',
      preview: { rows: [] },
      summary: {
        total: 0,
        new: 0,
        updated: 0,
        unchanged: 0,
        conflict: 0,
        error: 0,
        ignoredColumns: [],
      },
      createdAt: new Date(now),
      expiresAt: new Date(now + DAY),
    },
  });
}
