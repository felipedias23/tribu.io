import { Decimal } from 'decimal.js';
import { isValidCnpj, normalizeCnpj } from '../../companies/cnpj';
import type { TaxRegime } from '../../generated/prisma/enums';
import { STATES } from '../../tax-profiles/dto/put-tax-profile.dto';
import { type ImportColumn } from './columns';

/** Célula já lida do CSV ou do XLSX, antes de interpretar. */
export type RawCell =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'formula' }
  | { kind: 'error' }
  | null;

/** Perfil tributário de uma linha. Ausente = a célula estava vazia (D34). */
export interface ImportedProfile {
  taxRegime?: TaxRegime;
  cnae?: string;
  city?: string;
  state?: string;
  revenue12m?: string;
  payroll12m?: string;
  referencePeriod?: string;
  fatorRSubject?: boolean;
}

export interface ImportedValues {
  cnpj?: string;
  legalName?: string;
  tradeName?: string;
  externalId?: string;
  profile: ImportedProfile;
}

export interface ImportRowError {
  column: ImportColumn;
  message: string;
}

/** Valor interpretado ou mensagem de erro. */
type Parsed<T> = { value: T } | { error: string };

const MONEY = /^\d{1,13}(\.\d{1,2})?$/;

const REGIMES: Record<string, TaxRegime> = {
  'simples nacional': 'SIMPLES_NACIONAL',
  simples_nacional: 'SIMPLES_NACIONAL',
  'lucro presumido': 'LUCRO_PRESUMIDO',
  lucro_presumido: 'LUCRO_PRESUMIDO',
  'lucro real': 'LUCRO_REAL',
  lucro_real: 'LUCRO_REAL',
};

const YES = new Set(['sim', 's', 'true', 'verdadeiro', '1']);
const NO = new Set(['nao', 'n', 'false', 'falso', '0']);

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/** Número de uma célula numérica do Excel, também em notação científica. */
function excelNumber(value: string): Decimal | null {
  try {
    const number = new Decimal(value);
    return number.isFinite() ? number : null;
  } catch {
    return null;
  }
}

function text(max: number, label: string) {
  return (cell: string): Parsed<string> =>
    cell.length > max
      ? { error: `${label} deve ter no máximo ${max} caracteres.` }
      : { value: cell };
}

/**
 * CNPJ com ou sem máscara. Numa célula numérica, o Excel apaga os zeros à
 * esquerda: os dígitos são completados até 14 e os dígitos verificadores
 * confirmam o resultado.
 */
function cnpj(cell: string, numeric: boolean): Parsed<string> {
  let value = cell;
  if (numeric) {
    const number = excelNumber(cell);
    if (!number?.isInteger()) return { error: 'Informe um CNPJ válido.' };
    value = number.toFixed(0);
  }
  if (/^\d{1,13}$/.test(value)) value = value.padStart(14, '0');
  const normalized = normalizeCnpj(value);
  return isValidCnpj(normalized)
    ? { value: normalized }
    : { error: 'Informe um CNPJ válido.' };
}

function regime(cell: string): Parsed<TaxRegime> {
  const value = REGIMES[plain(cell)];
  return value
    ? { value }
    : {
        error:
          'Regime inválido. Use Simples Nacional, Lucro Presumido ou Lucro Real.',
      };
}

/** CNAE com ou sem máscara; numa célula numérica, completa os zeros à esquerda. */
function cnae(cell: string, numeric: boolean): Parsed<string> {
  let digits = cell.replace(/[\s./-]/g, '');
  if (numeric && /^\d{1,6}$/.test(digits)) digits = digits.padStart(7, '0');
  return /^\d{7}$/.test(digits)
    ? { value: digits }
    : { error: 'O CNAE deve ter 7 dígitos (ex.: 6201-5/01).' };
}

function state(cell: string): Parsed<string> {
  const value = cell.toUpperCase();
  return (STATES as readonly string[]).includes(value)
    ? { value }
    : { error: 'Informe a sigla de uma UF (ex.: SP).' };
}

/**
 * Valor em reais: `1.200.000,00`, `1200000,5`, `1200000.00` ou uma célula
 * numérica. Nunca negativo, no máximo 2 casas (as regras da API).
 */
function money(cell: string, numeric: boolean): Parsed<string> {
  const invalid = {
    error: 'Informe um valor em reais, não negativo, com até 2 casas decimais.',
  };
  let normalized = cell.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (numeric) {
    const number = excelNumber(cell);
    if (!number) return invalid;
    normalized = number.toFixed();
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  if (!MONEY.test(normalized)) return invalid;
  return { value: new Decimal(normalized).toFixed(2) };
}

/** Número de série de uma data do Excel → AAAA-MM. */
function serialToMonth(serial: Decimal, date1904: boolean): string | null {
  if (!serial.isFinite() || serial.lt(1)) return null;
  const days = Math.floor(serial.toNumber());
  // Sistema 1900: o Excel conta o inexistente 29/02/1900, por isso a época
  // efetiva é 30/12/1899. Sistema 1904: 01/01/1904.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + days * 86_400_000).toISOString().slice(0, 7);
}

/**
 * Mês de referência: `2026-09`, `09/2026`, `9/2026`, `30/09/2026` ou uma data
 * do Excel. Ano de 1900 a 2099 e nunca depois do mês atual (D29).
 */
function month(
  cell: string,
  numeric: boolean,
  date1904: boolean,
  currentPeriod: string,
): Parsed<string> {
  let value: string | null = null;
  if (numeric) {
    const serial = excelNumber(cell);
    value = serial ? serialToMonth(serial, date1904) : null;
  } else {
    const iso = /^(\d{4})-(\d{2})$/.exec(cell);
    const br = /^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/.exec(cell);
    if (iso) value = `${iso[1]}-${iso[2]}`;
    else if (br) value = `${br[2]}-${br[1].padStart(2, '0')}`;
  }
  if (!value || !/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) {
    return {
      error:
        'Informe o mês de referência como 2026-09 ou 09/2026, entre 1900 e 2099.',
    };
  }
  return value > currentPeriod
    ? { error: 'O mês de referência não pode estar no futuro.' }
    : { value };
}

function fatorR(cell: string): Parsed<boolean> {
  const value = plain(cell);
  if (YES.has(value)) return { value: true };
  if (NO.has(value)) return { value: false };
  return {
    error: 'Indique se a atividade está sujeita ao Fator R (sim ou não).',
  };
}

export interface NormalizeContext {
  /** Mês atual, AAAA-MM (quem chama fornece o relógio). */
  currentPeriod: string;
  date1904: boolean;
}

/**
 * Converte as células de uma linha nos valores do modelo (§3.6.1), com as
 * mesmas regras da API. Célula vazia fica ausente (D34). Cada problema fica
 * associado à sua coluna; a linha nunca lança.
 */
export function normalizeRow(
  cells: Partial<Record<ImportColumn, RawCell>>,
  { currentPeriod, date1904 }: NormalizeContext,
): { values: ImportedValues; errors: ImportRowError[] } {
  const values: ImportedValues = { profile: {} };
  const errors: ImportRowError[] = [];

  function read<T>(
    column: ImportColumn,
    parse: (cell: string, numeric: boolean) => Parsed<T>,
    assign: (value: T) => void,
  ): void {
    const cell = cells[column];
    if (!cell) return;
    if (cell.kind === 'formula') {
      errors.push({
        column,
        message: 'Célula com fórmula: exporte os valores, não as fórmulas.',
      });
      return;
    }
    if (cell.kind === 'error') {
      errors.push({ column, message: 'Célula com erro do Excel.' });
      return;
    }
    const raw = cell.value.trim();
    if (raw === '') return;
    // Num CSV, "=…" seria uma fórmula para o Excel: recusada (D35).
    if (cell.kind === 'text' && raw.startsWith('=')) {
      errors.push({
        column,
        message: 'Célula com fórmula: exporte os valores, não as fórmulas.',
      });
      return;
    }
    const parsed = parse(raw, cell.kind === 'number');
    if ('error' in parsed) errors.push({ column, message: parsed.error });
    else assign(parsed.value);
  }

  read('cnpj', cnpj, (v) => (values.cnpj = v));
  read(
    'razao_social',
    text(150, 'A razão social'),
    (v) => (values.legalName = v),
  );
  read(
    'nome_fantasia',
    text(150, 'O nome fantasia'),
    (v) => (values.tradeName = v),
  );
  read('id_externo', text(100, 'O id externo'), (v) => (values.externalId = v));
  read('regime', regime, (v) => (values.profile.taxRegime = v));
  read('cnae', cnae, (v) => (values.profile.cnae = v));
  read('municipio', text(100, 'O município'), (v) => (values.profile.city = v));
  read('uf', state, (v) => (values.profile.state = v));
  read('receita_12m', money, (v) => (values.profile.revenue12m = v));
  read('folha_12m', money, (v) => (values.profile.payroll12m = v));
  read(
    'mes_referencia',
    (cell, numeric) => month(cell, numeric, date1904, currentPeriod),
    (v) => (values.profile.referencePeriod = v),
  );
  read('sujeita_fator_r', fatorR, (v) => (values.profile.fatorRSubject = v));

  for (const [column, present] of [
    ['cnpj', values.cnpj],
    ['razao_social', values.legalName],
  ] as const) {
    if (present === undefined && !errors.some((e) => e.column === column)) {
      errors.push({ column, message: 'Obrigatório.' });
    }
  }
  return { values, errors };
}
