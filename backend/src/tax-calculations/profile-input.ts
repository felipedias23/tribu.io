import type { Prisma } from '../generated/prisma/client';
import type { FatorRInput } from './evaluation';

/** Campos do perfil tributário que entram no cálculo. */
export const PROFILE_INPUT_SELECT = {
  taxRegime: true,
  cnae: true,
  revenue12m: true,
  payroll12m: true,
  referencePeriod: true,
} satisfies Prisma.TaxProfileSelect;

type ProfileRow = Prisma.TaxProfileGetPayload<{
  select: typeof PROFILE_INPUT_SELECT;
}>;

/** Perfil do banco → entrada do cálculo (decimais e mês em texto). */
export function toFatorRInput(profile: ProfileRow | null): FatorRInput | null {
  if (!profile) return null;
  return {
    taxRegime: profile.taxRegime,
    cnae: profile.cnae,
    revenue12m: profile.revenue12m?.toFixed(2) ?? null,
    payroll12m: profile.payroll12m?.toFixed(2) ?? null,
    referencePeriod: profile.referencePeriod?.toISOString().slice(0, 7) ?? null,
  };
}

/** Mês atual em UTC, AAAA-MM (o mesmo relógio do perfil tributário). */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}
