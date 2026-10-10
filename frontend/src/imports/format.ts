import { formatMoney, formatPeriod, REGIME_LABELS } from '../companies/taxProfileFormat';
import type { ImportOutcome, ImportStatus } from './api';

export const STATUS_LABELS: Record<ImportStatus, string> = {
  PREVIEW: 'Prévia por confirmar',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export const OUTCOME_LABELS: Record<ImportOutcome, string> = {
  NEW: 'Novas',
  UPDATED: 'Atualizadas',
  UNCHANGED: 'Sem alterações',
  CONFLICT: 'Conflitos',
  ERROR: 'Com erro',
};

/** Nome dos campos nas mudanças (D36), como aparecem na ficha da empresa. */
export const FIELD_LABELS: Record<string, string> = {
  legalName: 'Razão social',
  tradeName: 'Nome fantasia',
  externalId: 'Id externo',
  taxRegime: 'Regime tributário',
  cnae: 'CNAE',
  city: 'Município',
  state: 'UF',
  revenue12m: 'Receita bruta (12 meses)',
  payroll12m: 'Folha de pagamento (12 meses)',
  referencePeriod: 'Mês de referência',
  fatorRSubject: 'Atividade sujeita ao Fator R',
};

/** Valor de uma mudança no formato da ficha da empresa. */
export function formatValue(field: string, value: string | boolean | null): string {
  if (value === null) return 'vazio';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (field === 'revenue12m' || field === 'payroll12m') return formatMoney(value);
  if (field === 'referencePeriod') return formatPeriod(value);
  if (field === 'taxRegime') return REGIME_LABELS[value as keyof typeof REGIME_LABELS] ?? value;
  return value;
}

/** Conteúdo do ficheiro em base64, para ir dentro de JSON (D35). */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}
