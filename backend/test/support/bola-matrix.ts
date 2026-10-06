import { PrismaClient, Role } from '../../src/generated/prisma/client';
import type { Tenant } from './tenants';

/**
 * Uma linha por rota com `:id` (decisão D17). O inventário de rotas falha se
 * surgir uma rota com parâmetro sem linha aqui.
 */
export interface BolaCase {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Caminho sem o prefixo /api/v1, como no inventário (ex.: /users/:id). */
  path: string;
  /** Recurso do escritório B que o ADMIN do escritório A tenta usar. */
  targetId(b: Tenant): string;
  /** Corpo válido, para que a resposta não seja um 400 de validação. */
  body?: object;
  /** Estado do recurso, que tem de ficar igual depois do pedido. */
  snapshot(prisma: PrismaClient, id: string): Promise<unknown>;
}

export const BOLA_CASES: BolaCase[] = [
  {
    method: 'PATCH',
    path: '/users/:id',
    targetId: (b) => b.analyst.id,
    body: { name: 'Invadido', role: Role.ADMIN },
    snapshot: (prisma, id) => prisma.user.findUniqueOrThrow({ where: { id } }),
  },
];

export function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}
