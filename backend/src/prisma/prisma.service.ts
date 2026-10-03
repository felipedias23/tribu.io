import { tenantScope } from './tenant-scope';
import type { UnscopedPrismaService } from './unscoped-prisma.service';

export function createPrismaService(client: UnscopedPrismaService) {
  return client.$extends(tenantScope);
}

/**
 * Cliente do Prisma usado pela API: recusa queries sobre tabelas do tenant sem
 * `accountingFirmId` (decisão D16). Partilha a conexão do
 * `UnscopedPrismaService`. Injetar com `@Inject(PrismaService)`.
 */
export type PrismaService = ReturnType<typeof createPrismaService>;
export const PrismaService = Symbol('PrismaService');
