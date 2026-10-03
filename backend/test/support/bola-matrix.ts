import { PrismaClient, Role } from '../../src/generated/prisma/client';
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
];

export function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}
