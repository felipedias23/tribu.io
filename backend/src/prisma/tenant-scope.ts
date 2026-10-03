import { Prisma } from '../generated/prisma/client';

/**
 * Campos escalares de cada model. O tipo exige uma entrada por model do
 * schema: um model novo não compila até ser acrescentado aqui, e passa a ser
 * verificado automaticamente se tiver `accountingFirmId`.
 */
const SCALAR_FIELDS: Record<Prisma.ModelName, Record<string, string>> = {
  AccountingFirm: Prisma.AccountingFirmScalarFieldEnum,
  User: Prisma.UserScalarFieldEnum,
};

/** Models do tenant: os que têm a coluna `accountingFirmId` (decisão D15). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.entries(SCALAR_FIELDS)
    .filter(([, fields]) => 'accountingFirmId' in fields)
    .map(([model]) => model),
);

/** Operações que leem ou alteram registos existentes: exigem tenant no `where`. */
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

/** Operações que criam registos: exigem tenant em cada `data`. */
const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
]);

/** Operações que alteram registos: o tenant de um registo nunca muda. */
const UPDATE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
]);

/** Query sobre tabela do tenant sem o filtro do escritório. É um erro de programação. */
export class TenantScopeViolationError extends Error {
  constructor(model: string, operation: string, reason: string) {
    super(`${model}.${operation} recusada: ${reason} (decisão D16).`);
    this.name = 'TenantScopeViolationError';
  }
}

type Args = Record<string, unknown> | undefined;

function hasTenant(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).accountingFirmId === 'string' &&
    (value as Record<string, string>).accountingFirmId !== ''
  );
}

function setsTenant(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && 'accountingFirmId' in value
  );
}

/**
 * Recusa a query se o model é do tenant e falta o escritório:
 * - leitura e alteração: `accountingFirmId` como string no nível superior do
 *   `where` (dentro de `OR`, `AND` ou `NOT`, ou como `{ in: [...] }`, não conta);
 * - criação: `accountingFirmId` em cada `data`;
 * - alteração: `accountingFirmId` não pode estar no `data`.
 * Operações desconhecidas são recusadas.
 *
 * Não cobre `$queryRaw` (regra S6) nem escritas aninhadas a partir de outro
 * model; nestas, as FKs compostas (D15) impedem ligar escritórios diferentes.
 */
export function assertTenantScoped(
  model: string,
  operation: string,
  args: Args,
): void {
  if (!TENANT_MODELS.has(model)) return;

  const fail = (reason: string) => {
    throw new TenantScopeViolationError(model, operation, reason);
  };

  if (CREATE_OPERATIONS.has(operation)) {
    const data = args?.data;
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0 || !rows.every(hasTenant)) {
      fail('falta accountingFirmId no data');
    }
    return;
  }

  if (!WHERE_OPERATIONS.has(operation)) {
    fail('operação sem verificação de tenant');
  }
  if (!hasTenant(args?.where)) {
    fail('falta accountingFirmId no nível superior do where');
  }
  if (UPDATE_OPERATIONS.has(operation) && setsTenant(args?.data)) {
    fail('o data não pode alterar accountingFirmId');
  }
  if (operation === 'upsert') {
    if (!hasTenant(args?.create)) fail('falta accountingFirmId no create');
    if (setsTenant(args?.update)) {
      fail('o update não pode alterar accountingFirmId');
    }
  }
}

/** Client Extension que aplica `assertTenantScoped` a todas as queries. */
export const tenantScope = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        assertTenantScoped(model, operation, args);
        return query(args);
      },
    },
  },
});
