/** Campos de uma versão de regra usados para escolher a vigente. */
export interface VersionValidity {
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  validFrom: Date;
  /** Exclusivo; null = sem fim. */
  validUntil: Date | null;
}

/** Primeiro dia (UTC) do mês de referência AAAA-MM. */
export function firstDayOf(referencePeriod: string): Date {
  return new Date(`${referencePeriod}-01T00:00:00.000Z`);
}

/**
 * Versão PUBLISHED vigente no mês de referência (§3.4): `validFrom` ≤ dia 1 do
 * mês < `validUntil`. Sem versão vigente devolve null (o Radar sinaliza
 * REVISAR_REGRA). O banco garante no máximo uma (EXCLUDE).
 */
export function selectVersion<V extends VersionValidity>(
  versions: readonly V[],
  referencePeriod: string,
): V | null {
  const day = firstDayOf(referencePeriod).getTime();
  return (
    versions.find(
      (v) =>
        v.status === 'PUBLISHED' &&
        v.validFrom.getTime() <= day &&
        (v.validUntil === null || day < v.validUntil.getTime()),
    ) ?? null
  );
}
