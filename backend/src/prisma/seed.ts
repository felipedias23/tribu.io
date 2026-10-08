/**
 * Seed de desenvolvimento: dados fictícios, determinísticos e idempotentes.
 *
 * Executado por `npm run db:seed` (local) e pelo entrypoint do container quando
 * SEED_ON_START=true. Pode correr várias vezes sem duplicar dados: cada registo
 * tem um ID fixo e é atualizado pela sua chave única.
 *
 * As contas criadas estão documentadas em docs/banco-de-dados.md. A password
 * vem de SEED_PASSWORD; nenhuma credencial fica no código.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { cnpjCheckDigits } from '../companies/cnpj';
import {
  databaseUrlSchema,
  parseOrThrow,
  rejectExampleValues,
} from '../config/env.validation';
import { PrismaClient, Role, TaxRegime } from '../generated/prisma/client';

/** Escritórios fictícios. Sem CNPJ, para não coincidir com empresas reais. */
export const SEED_FIRMS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Alfa Contabilidade' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Beta Contabilidade' },
] as const;

const [ALFA, BETA] = SEED_FIRMS;

/** Um utilizador por papel em cada escritório. Domínio `.example` (RFC 2606). */
export const SEED_USERS = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    accountingFirmId: ALFA.id,
    name: 'Admin Alfa',
    email: 'admin@alfa.tribu.example',
    role: Role.ADMIN,
  },
  {
    id: '11111111-0000-4000-8000-000000000002',
    accountingFirmId: ALFA.id,
    name: 'Analista Alfa',
    email: 'analista@alfa.tribu.example',
    role: Role.ANALYST,
  },
  {
    id: '11111111-0000-4000-8000-000000000003',
    accountingFirmId: ALFA.id,
    name: 'Consulta Alfa',
    email: 'consulta@alfa.tribu.example',
    role: Role.VIEWER,
  },
  {
    id: '22222222-0000-4000-8000-000000000001',
    accountingFirmId: BETA.id,
    name: 'Admin Beta',
    email: 'admin@beta.tribu.example',
    role: Role.ADMIN,
  },
  {
    id: '22222222-0000-4000-8000-000000000002',
    accountingFirmId: BETA.id,
    name: 'Analista Beta',
    email: 'analista@beta.tribu.example',
    role: Role.ANALYST,
  },
  {
    id: '22222222-0000-4000-8000-000000000003',
    accountingFirmId: BETA.id,
    name: 'Consulta Beta',
    email: 'consulta@beta.tribu.example',
    role: Role.VIEWER,
  },
] as const;

/** Nome e nome fantasia das empresas fictícias de cada escritório (US06). */
const COMPANY_NAMES: Record<'A' | 'B', [string, string | null][]> = {
  A: [
    ['Oficina Exemplo Ltda', 'Oficina Exemplo'],
    ['Clínica Modelo Ltda', 'Clínica Modelo'],
    ['Estúdio Fictício de Design Ltda', null],
    ['Padaria Imaginária Ltda', 'Pão Imaginário'],
    ['Consultoria Demonstração Ltda', null],
    ['Transportes Ilustrativos Ltda', 'TransIlustra'],
  ],
  B: [
    ['Laboratório Hipotético Ltda', 'LabHipo'],
    ['Escola Simulada Ltda', 'Escola Simulada'],
    ['Mercado Inventado Ltda', null],
    ['Arquitetura Exemplar Ltda', 'Exemplar Arquitetura'],
    ['Software Fictício Ltda', 'FicSoft'],
    ['Restaurante Demonstrativo Ltda', null],
  ],
};

/**
 * ID fixo e CNPJ fictício derivados da posição. A raiz do CNPJ começa por
 * TRIBU, para não coincidir com empresas reais, e os dígitos verificadores
 * são válidos.
 */
export const SEED_COMPANIES = (
  [
    [ALFA, 'A'],
    [BETA, 'B'],
  ] as const
).flatMap(([firm, letter]) =>
  COMPANY_NAMES[letter].map(([legalName, tradeName], index) => {
    const n = String(index + 1).padStart(6, '0');
    const base = `TRIBU${letter}${n}`;
    return {
      id: `${firm.id.slice(0, 8)}-c000-4000-8000-000000${n}`,
      accountingFirmId: firm.id,
      cnpj: `${base}${cnpjCheckDigits(base)}`,
      legalName,
      tradeName,
    };
  }),
);

type SeedTaxProfile = {
  taxRegime: TaxRegime | null;
  cnae: string | null;
  city: string | null;
  state: string | null;
  revenue12m: string | null;
  payroll12m: string | null;
  referencePeriod: string | null;
};

const { SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL } = TaxRegime;

/**
 * Perfis tributários fictícios (US08), pela posição da empresa em
 * COMPANY_NAMES. Há perfis completos, perfis com dados ausentes (null) e
 * empresas sem perfil, para a demonstração e o Tax Radar.
 */
// prettier-ignore
const TAX_PROFILES: Record<'A' | 'B', (SeedTaxProfile | null)[]> = {
  A: [
    { taxRegime: SIMPLES_NACIONAL, cnae: '4520001', city: 'São Paulo', state: 'SP', revenue12m: '1200000.00', payroll12m: '300000.00', referencePeriod: '2026-09' },
    { taxRegime: SIMPLES_NACIONAL, cnae: '8630503', city: 'Campinas', state: 'SP', revenue12m: '2400000.00', payroll12m: '720000.00', referencePeriod: '2026-09' },
    { taxRegime: SIMPLES_NACIONAL, cnae: '7410202', city: 'Santos', state: 'SP', revenue12m: '480000.00', payroll12m: null, referencePeriod: '2026-09' },
    { taxRegime: LUCRO_PRESUMIDO, cnae: '1091102', city: 'Belo Horizonte', state: 'MG', revenue12m: '5200000.00', payroll12m: '900000.00', referencePeriod: '2026-09' },
    null,
    { taxRegime: LUCRO_REAL, cnae: '4930202', city: 'Curitiba', state: 'PR', revenue12m: '48000000.00', payroll12m: '7500000.00', referencePeriod: '2026-09' },
  ],
  B: [
    { taxRegime: SIMPLES_NACIONAL, cnae: '7120100', city: 'Porto Alegre', state: 'RS', revenue12m: '1800000.00', payroll12m: '540000.00', referencePeriod: '2026-09' },
    { taxRegime: SIMPLES_NACIONAL, cnae: '8513900', city: 'Florianópolis', state: 'SC', revenue12m: null, payroll12m: '210000.00', referencePeriod: '2026-09' },
    null,
    { taxRegime: SIMPLES_NACIONAL, cnae: '7111100', city: 'Recife', state: 'PE', revenue12m: '960000.00', payroll12m: '250000.00', referencePeriod: '2026-09' },
    { taxRegime: SIMPLES_NACIONAL, cnae: '6201501', city: 'Recife', state: 'PE', revenue12m: '3100000.00', payroll12m: '1085000.00', referencePeriod: '2026-09' },
    { taxRegime: LUCRO_PRESUMIDO, cnae: '5611201', city: 'Salvador', state: 'BA', revenue12m: '2700000.00', payroll12m: '650000.00', referencePeriod: null },
  ],
};

export const SEED_TAX_PROFILES = SEED_COMPANIES.flatMap((company) => {
  const letter = company.cnpj[5] as 'A' | 'B';
  const index = Number(company.cnpj.slice(6, 12)) - 1;
  const profile = TAX_PROFILES[letter][index];
  if (!profile) return [];
  const { referencePeriod, ...data } = profile;
  return [
    {
      accountingFirmId: company.accountingFirmId,
      companyId: company.id,
      ...data,
      referencePeriod: referencePeriod
        ? new Date(`${referencePeriod}-01T00:00:00.000Z`)
        : null,
    },
  ];
});

const seedEnvSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: databaseUrlSchema,
    SEED_PASSWORD: z
      .string({ error: 'obrigatória para criar as contas de desenvolvimento' })
      .min(8, 'deve ter pelo menos 8 caracteres'),
  })
  // Recusa antes de criar contas: no arranque, o seed corre antes da API.
  .superRefine((env, ctx) =>
    rejectExampleValues(env, ['DATABASE_URL', 'SEED_PASSWORD'], ctx),
  );

export function validateSeedEnv(config: Record<string, unknown>) {
  return parseOrThrow(seedEnvSchema, config);
}

/**
 * Cria ou atualiza os dados fictícios. A password só é definida na criação:
 * reexecutar o seed não altera o hash nem o `tokenVersion` de contas existentes.
 */
export async function seed(prisma: PrismaClient, password: string) {
  const passwordHashes = await Promise.all(
    SEED_USERS.map(() => argon2.hash(password)),
  );

  await prisma.$transaction(async (tx) => {
    for (const firm of SEED_FIRMS) {
      await tx.accountingFirm.upsert({
        where: { id: firm.id },
        create: firm,
        update: { name: firm.name },
      });
    }

    for (const [index, user] of SEED_USERS.entries()) {
      const { id, email, ...data } = user;
      await tx.user.upsert({
        where: { email },
        create: { id, email, ...data, passwordHash: passwordHashes[index] },
        update: data,
      });
    }

    for (const { id, ...company } of SEED_COMPANIES) {
      await tx.company.upsert({
        where: { id },
        create: { id, ...company },
        update: company,
      });
    }

    for (const {
      companyId,
      accountingFirmId,
      ...profile
    } of SEED_TAX_PROFILES) {
      await tx.taxProfile.upsert({
        where: { companyId_accountingFirmId: { companyId, accountingFirmId } },
        create: { companyId, accountingFirmId, ...profile },
        update: profile,
      });
    }
  });

  return {
    firms: SEED_FIRMS.length,
    users: SEED_USERS.length,
    companies: SEED_COMPANIES.length,
    taxProfiles: SEED_TAX_PROFILES.length,
  };
}

async function main(): Promise<void> {
  const env = validateSeedEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const result = await seed(prisma, env.SEED_PASSWORD);
    console.log(
      `[seed] OK: ${result.firms} escritórios, ${result.users} utilizadores, ${result.companies} empresas e ${result.taxProfiles} perfis tributários.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[seed] Falhou:', error);
    process.exit(1);
  });
}
