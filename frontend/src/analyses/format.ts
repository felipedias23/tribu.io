import type { RequiredField } from './api';

export const FIELD_LABELS: Record<RequiredField, string> = {
  taxRegime: 'Regime tributário',
  revenue12m: 'Receita bruta (12 meses)',
  payroll12m: 'Folha de pagamento (12 meses)',
  referencePeriod: 'Mês de referência',
};

export const ANALYSIS_STATUS_LABELS = {
  COMPLETED: 'Concluída',
  INCOMPLETE: 'Incompleta',
} as const;

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

/** Momento de uma execução, na hora local: "09/10/2026, 17:16". */
export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

/**
 * Vigência de uma versão. `validUntil` é exclusivo (o primeiro dia em que já
 * não vale), por isso mostra-se o dia anterior.
 */
export function formatValidity(validFrom: string, validUntil: string | null): string {
  const from = dayFormat.format(new Date(`${validFrom}T00:00:00Z`));
  if (!validUntil) return `desde ${from}, sem data de fim`;
  const last = new Date(`${validUntil}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  return `de ${from} a ${dayFormat.format(last)}`;
}
