import { PrismaClient, Role } from '../../src/generated/prisma/client';
import { createAnalysis } from './analyses';
import { createCompany } from './companies';
import type { Tenant } from './tenants';

/**
 * Uma linha por rota com `:id` (decisão D17). O inventário de rotas falha se
 * surgir uma rota com parâmetro sem linha aqui.
 */
export interface BolaCase {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Caminho sem o prefixo /api/v1, como no inventário (ex.: /users/:id). */
  path: string;
  /** Cria (ou escolhe) o recurso do escritório B que o ADMIN de A tenta usar. */
  targetId(b: Tenant, prisma: PrismaClient): Promise<string>;
  /** Corpo válido, para que a resposta não seja um 400 de validação. */
  body?: object;
  /** Estado do recurso, que tem de ficar igual depois do pedido. */
  snapshot(prisma: PrismaClient, id: string): Promise<unknown>;
}

export const BOLA_CASES: BolaCase[] = [
  {
    method: 'PATCH',
    path: '/users/:id',
    targetId: (b) => Promise.resolve(b.analyst.id),
    body: { name: 'Invadido', role: Role.ADMIN },
    snapshot: (prisma, id) => prisma.user.findUniqueOrThrow({ where: { id } }),
  },
  {
    method: 'GET',
    path: '/companies/:id',
    targetId: async (b, prisma) => (await createCompany(prisma, b.firmId)).id,
    snapshot: (prisma, id) =>
      prisma.company.findUniqueOrThrow({ where: { id } }),
  },
  {
    method: 'PATCH',
    path: '/companies/:id',
    targetId: async (b, prisma) => (await createCompany(prisma, b.firmId)).id,
    body: { legalName: 'Invadida Ltda', cnpj: '12.ABC.345/01DE-35' },
    snapshot: (prisma, id) =>
      prisma.company.findUniqueOrThrow({ where: { id } }),
  },
  {
    method: 'GET',
    path: '/companies/:id/tax-profile',
    targetId: async (b, prisma) => {
      const company = await createCompany(prisma, b.firmId);
      await prisma.taxProfile.create({
        data: {
          accountingFirmId: b.firmId,
          companyId: company.id,
          revenue12m: '1000.00',
        },
      });
      return company.id;
    },
    snapshot: (prisma, companyId) =>
      prisma.taxProfile.findFirst({ where: { companyId } }),
  },
  {
    method: 'PUT',
    path: '/companies/:id/tax-profile',
    targetId: async (b, prisma) => (await createCompany(prisma, b.firmId)).id,
    body: { revenue12m: '999.00', taxRegime: 'LUCRO_REAL' },
    // Sem perfil antes; o pedido de A não pode criá-lo.
    snapshot: (prisma, companyId) =>
      prisma.taxProfile.findFirst({ where: { companyId } }),
  },
  {
    method: 'POST',
    path: '/companies/:id/analyses',
    targetId: async (b, prisma) => {
      const company = await createCompany(prisma, b.firmId);
      await prisma.taxProfile.create({
        data: {
          accountingFirmId: b.firmId,
          companyId: company.id,
          taxRegime: 'SIMPLES_NACIONAL',
          revenue12m: '1000000.00',
          payroll12m: '300000.00',
          referencePeriod: new Date('2026-01-01'),
        },
      });
      return company.id;
    },
    // A não pode criar uma análise na empresa de B.
    snapshot: (prisma, companyId) =>
      prisma.analysis.findMany({ where: { companyId } }),
  },
  {
    method: 'GET',
    path: '/companies/:id/analyses',
    targetId: async (b, prisma) => {
      const company = await createCompany(prisma, b.firmId);
      await createAnalysis(prisma, b, company.id);
      return company.id;
    },
    snapshot: (prisma, companyId) =>
      prisma.analysis.findMany({ where: { companyId } }),
  },
  {
    method: 'GET',
    path: '/analyses/:id',
    targetId: async (b, prisma) => {
      const company = await createCompany(prisma, b.firmId);
      return (await createAnalysis(prisma, b, company.id)).id;
    },
    snapshot: (prisma, id) =>
      prisma.analysis.findUniqueOrThrow({ where: { id } }),
  },
];

export function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}
