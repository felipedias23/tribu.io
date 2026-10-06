import { PrismaClient } from '../src/generated/prisma/client';
import { createTestPrisma } from './support/prisma';

/**
 * Tabelas fora do tenant. `accounting_firms` é o próprio tenant. Acrescentar
 * uma tabela aqui exige justificação no PR (ex.: catálogo global, regra S11).
 */
const GLOBAL_TABLES = ['_prisma_migrations', 'accounting_firms'];

interface ForeignKey {
  name: string;
  source: string;
  target: string;
  columns: string[];
  refColumns: string[];
}

/**
 * Catálogo do schema (decisão D17, regras S7 e S8), lido do PostgreSQL com as
 * migrations aplicadas: toda tabela nova do tenant tem de cumprir o D15.
 */
describe('Catálogo do schema (e2e)', () => {
  let prisma: PrismaClient;
  let tenantTables: string[];

  beforeAll(async () => {
    prisma = createTestPrisma();
    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    tenantTables = tables
      .map((table) => table.name)
      .filter((name) => !GLOBAL_TABLES.includes(name))
      .sort();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('encontra as tabelas do tenant', () => {
    expect(tenantTables).toContain('users');
  });

  it('toda tabela do tenant tem accounting_firm_id uuid NOT NULL (S7)', async () => {
    const columns = await prisma.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'accounting_firm_id'
        AND data_type = 'uuid' AND is_nullable = 'NO'`;
    const compliant = new Set(columns.map((column) => column.name));

    expect(tenantTables.filter((table) => !compliant.has(table))).toEqual([]);
  });

  it('toda tabela do tenant tem um índice que começa por accounting_firm_id (S7)', async () => {
    const indexes = await prisma.$queryRaw<{ name: string }[]>`
      SELECT DISTINCT c.relname AS name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = 'public' AND a.attname = 'accounting_firm_id'`;
    const indexed = new Set(indexes.map((index) => index.name));

    expect(tenantTables.filter((table) => !indexed.has(table))).toEqual([]);
  });

  it('toda FK entre tabelas do tenant é composta com accounting_firm_id (S8)', async () => {
    const foreignKeys = await prisma.$queryRaw<ForeignKey[]>`
      SELECT con.conname AS name, src.relname AS source, tgt.relname AS target,
        ARRAY(
          SELECT attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute ON attrelid = con.conrelid AND pg_attribute.attnum = k.attnum
          ORDER BY ord
        )::text[] AS columns,
        ARRAY(
          SELECT attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute ON attrelid = con.confrelid AND pg_attribute.attnum = k.attnum
          ORDER BY ord
        )::text[] AS "refColumns"
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      WHERE con.contype = 'f' AND n.nspname = 'public'`;

    const notComposite = foreignKeys
      .filter(
        (fk) =>
          tenantTables.includes(fk.source) && tenantTables.includes(fk.target),
      )
      .filter((fk) => {
        const position = fk.columns.indexOf('accounting_firm_id');
        return (
          fk.columns.length < 2 ||
          position === -1 ||
          fk.refColumns[position] !== 'accounting_firm_id'
        );
      })
      .map((fk) => `${fk.source}.${fk.name}`);

    expect(notComposite).toEqual([]);
  });
});
