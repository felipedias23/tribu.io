import { PrismaClient } from '../../src/generated/prisma/client';
import type { Tenant } from './tenants';

/**
 * Grava diretamente uma análise INCOMPLETE (sem versão), para testes que só
 * precisam de que ela exista.
 */
export function createAnalysis(
  prisma: PrismaClient,
  tenant: Tenant,
  companyId: string,
) {
  return prisma.analysis.create({
    data: {
      accountingFirmId: tenant.firmId,
      companyId,
      executedById: tenant.analyst.id,
      inputSnapshot: { taxRegime: null },
      engineVersion: '1.0.0',
      status: 'INCOMPLETE',
      radarStatus: 'DADOS_INCOMPLETOS',
      trace: { reasons: [] },
    },
  });
}
