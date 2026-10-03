import type { TaxRegime } from './api';

export const REGIME_LABELS: Record<TaxRegime, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
};

// prettier-ignore
export const STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Máscara do CNAE (0000-0/00), aplicada à medida que se escreve. */
export function formatCnae(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 4) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}

const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyInputFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1200000.00" → "R$ 1.200.000,00". */
export function formatMoney(value: string): string {
  return moneyFormat.format(Number(value));
}

/** Valor da API para o campo do formulário: "1200000.00" → "1.200.000,00". */
export function moneyToInput(value: string | null): string {
  return value === null ? '' : moneyInputFormat.format(Number(value));
}

/**
 * Valor escrito pelo utilizador para a API: aceita "1.200.000,00",
 * "1200000,5" ou "1200000.50". Vazio é dado ausente (null). A validação
 * (não negativo, 2 casas) é do backend.
 */
export function inputToMoney(value: string): string | null {
  const cleaned = value.replace(/R\$|\s/g, '');
  if (cleaned === '') return null;
  return cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
}

const periodFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-09" → "setembro de 2026". */
export function formatPeriod(value: string): string {
  return periodFormat.format(new Date(`${value}-01T00:00:00Z`));
}
