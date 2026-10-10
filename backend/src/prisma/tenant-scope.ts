import { Prisma } from '../generated/prisma/client';

/**
 * Campos escalares de cada model. O tipo exige uma entrada por model do
 * schema: um model novo não compila até ser acrescentado aqui, e passa a ser
 * verificado automaticamente se tiver `accountingFirmId`.
 */
const SCALAR_FIELDS: Record<Prisma.ModelName, Record<string, string>> = {
  AccountingFirm: Prisma.AccountingFirmScalarFieldEnum,
  Analysis: Prisma.AnalysisScalarFieldEnum,
  Company: Prisma.CompanyScalarFieldEnum,
  ExternalCompanyMapping: Prisma.ExternalCompanyMappingScalarFieldEnum,
  ImportBatch: Prisma.ImportBatchScalarFieldEnum,
  Integration: Prisma.IntegrationScalarFieldEnum,
  TaxProfile: Prisma.TaxProfileScalarFieldEnum,
  TaxRule: Prisma.TaxRuleScalarFieldEnum,
  TaxRuleVersion: Prisma.TaxRuleVersionScalarFieldEnum,
  User: Prisma.UserScalarFieldEnum,
};

/**
 * Catálogo global (regras tributárias): sem tenant, mas também sem escrita
 * pela API. Muda só por migration (regra S11).
 */
export const READ_ONLY_MODELS: ReadonlySet<string> = new Set([
  'TaxRule',
  'TaxRuleVersion',
]);

/**
 * Tabelas do tenant só de inserção: um registo nunca muda nem é apagado pela
 * API (análises imutáveis, §3.4). Apagar fica para a remoção do escritório.
 */
export const APPEND_ONLY_MODELS: ReadonlySet<string> = new Set(['Analysis']);

/** Operações que só leem. */
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Models do tenant: os que têm a coluna `accountingFirmId` (decisão D15). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.entries(SCALAR_FIELDS)
    .filter(([, fields]) => 'accountingFirmId' in fields)
    .map(([model]) => model),
);

/**
 * O próprio tenant. Não tem `accountingFirmId`, mas as suas relações levam a
 * todos os dados do escritório (`include: { companies: true }`): é verificado
 * pelo `id` no `where`.
 */
export const TENANT_ROOT_MODEL = 'AccountingFirm';

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

function hasTenantId(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    (value as Record<string, string>).id !== ''
  );
}

function setsTenant(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && 'accountingFirmId' in value
  );
}

/**
 * O escritório só é lido ou alterado pelo seu `id`, no nível superior do
 * `where`. Criar escritórios (registo) e upsert ficam no cliente `unscoped`.
 */
function assertTenantRootScoped(
  operation: string,
  args: Args,
  fail: (reason: string) => never,
): void {
  if (CREATE_OPERATIONS.has(operation) || operation === 'upsert') {
    fail('o escritório só é criado no módulo auth (cliente unscoped)');
  }
  if (!WHERE_OPERATIONS.has(operation)) {
    fail('operação sem verificação de tenant');
  }
  if (!hasTenantId(args?.where)) {
    fail('falta o id do escritório no nível superior do where');
  }
  if (
    UPDATE_OPERATIONS.has(operation) &&
    typeof args?.data === 'object' &&
    args.data !== null &&
    'id' in args.data
  ) {
    fail('o data não pode alterar o id do escritório');
  }
}

/**
 * Recusa a query se o model é do tenant e falta o escritório:
 * - leitura e alteração: `accountingFirmId` como string no nível superior do
 *   `where` (dentro de `OR`, `AND` ou `NOT`, ou como `{ in: [...] }`, não conta);
 * - criação: `accountingFirmId` em cada `data`;
 * - alteração: `accountingFirmId` não pode estar no `data`.
 * O próprio escritório (`AccountingFirm`) é verificado pelo `id`. O catálogo
 * global (`READ_ONLY_MODELS`) só aceita leituras.
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
  const fail = (reason: string): never => {
    throw new TenantScopeViolationError(model, operation, reason);
  };

  if (READ_ONLY_MODELS.has(model)) {
    if (!READ_OPERATIONS.has(operation)) {
      fail('catálogo global só muda por migration (regra S11)');
    }
    return;
  }
  if (model === TENANT_ROOT_MODEL) {
    assertTenantRootScoped(operation, args, fail);
    return;
  }
  if (!TENANT_MODELS.has(model)) return;
  if (
    APPEND_ONLY_MODELS.has(model) &&
    !READ_OPERATIONS.has(operation) &&
    !CREATE_OPERATIONS.has(operation)
  ) {
    fail('registo imutável: só inserção e leitura');
  }

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
