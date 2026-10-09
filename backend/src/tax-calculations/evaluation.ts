import { Decimal } from 'decimal.js';
import type { TaxRegime } from '../generated/prisma/enums';

/**
 * Versão do Tax Engine gravada em cada análise (§3.4). Muda quando o código
 * de um evaluator muda de forma que altere resultados.
 */
export const ENGINE_VERSION = '1.1.0';

/**
 * Aritmética decimal do Tax Engine: nunca vírgula flutuante. Precisão de 40
 * dígitos significativos; arredondamento "metade para cima", o usual em
 * valores apresentados ao contador.
 */
export const Dec = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});
export type Dec = Decimal;

/**
 * Entrada do cálculo, igual ao perfil tributário e ao snapshot que a análise
 * guarda (D6). Decimais em texto; `null` é dado ausente (D20).
 */
export interface FatorRInput {
  taxRegime: TaxRegime | null;
  cnae: string | null;
  /** RBT12, ex.: "1200000.00". */
  revenue12m: string | null;
  payroll12m: string | null;
  /** Mês de referência, AAAA-MM. */
  referencePeriod: string | null;
  /**
   * Atividade sujeita ao Fator R (D33); null = não informado. Ausente nos
   * snapshots anteriores à D33, lidos só pelo evaluator @1.
   */
  fatorRSubject?: boolean | null;
}

/** Campos obrigatórios para o cálculo do Fator R. */
export type RequiredField =
  | 'taxRegime'
  | 'revenue12m'
  | 'payroll12m'
  | 'referencePeriod'
  | 'fatorRSubject';

const REQUIRED_IN_SIMPLES: RequiredField[] = [
  'revenue12m',
  'payroll12m',
  'referencePeriod',
];

/**
 * Campos em falta para o evaluator @1, que não muda (§3.4): sem a
 * elegibilidade ao Fator R. Sem regime, o regime também falta.
 */
export function missingFields(input: FatorRInput): RequiredField[] {
  return [
    ...(input.taxRegime === null ? (['taxRegime'] as const) : []),
    ...REQUIRED_IN_SIMPLES.filter((field) => input[field] === null),
  ];
}

/**
 * Campos em falta para o cálculo atual (evaluator @2, D33): os do @1 e a
 * confirmação de que a atividade está sujeita ao Fator R. Usado pelo Radar e
 * pelas análises.
 */
export function missingFieldsForFatorR(input: FatorRInput): RequiredField[] {
  const missing = missingFields(input);
  return input.fatorRSubject == null ? [...missing, 'fatorRSubject'] : missing;
}

/** CNAE com máscara para os textos: 7111100 → "7111-1/00". */
export function formatCnae(cnae: string): string {
  return `${cnae.slice(0, 4)}-${cnae.slice(4, 5)}/${cnae.slice(5)}`;
}

/** Passo do raciocínio, mostrado na explicação (US11). */
export interface TraceStep {
  code: string;
  description: string;
  values: Record<string, string>;
}

/** Premissa assumida pelo cálculo, sempre visível ao contador. */
export interface Assumption {
  code: string;
  description: string;
}

export interface FatorRResult {
  /** Folha ÷ RBT12, com a precisão completa do cálculo. */
  fatorR: string;
  annex: 'III' | 'V';
  /** Faixa de RBT12, de 1 a 6. */
  bracket: number;
  nominalRate: string;
  deduction: string;
  /** Alíquota efetiva como fração, com 4 casas (0.1303 = 13,03%). */
  effectiveRate: string;
}

interface Explained {
  trace: TraceStep[];
  assumptions: Assumption[];
}

/** Resultado de um evaluator. Nenhum valor é inventado: o que falta é listado. */
export type FatorROutcome =
  | ({ status: 'COMPLETED'; result: FatorRResult } & Explained)
  | ({ status: 'INCOMPLETE'; missing: RequiredField[] } & Explained)
  | ({
      status: 'NOT_COMPUTABLE';
      code: 'REVENUE_ZERO' | 'REVENUE_ABOVE_LIMIT';
      message: string;
    } & Explained)
  | ({
      status: 'NOT_APPLICABLE';
      code: 'REGIME_NOT_SIMPLES' | 'ACTIVITY_NOT_SUBJECT';
      message: string;
    } & Explained);

/** Número no formato brasileiro: 1234567.8 com 2 casas → "1.234.567,80". */
function ptBr(fixed: string): string {
  const [integer, decimals] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

/** Valor em reais para os textos da explicação: "R$ 1.200.000,00". */
export function formatBrl(value: Dec): string {
  return `R$ ${ptBr(value.toFixed(2))}`;
}

/**
 * Fração em percentagem com 2 casas: 0.1303 → "13,03%". Com `truncate`, um
 * valor abaixo de um limiar nunca aparece igual a ele (27,9999% → "27,99%").
 */
export function formatPercent(value: Dec, truncate = false): string {
  const percent = value.times(100);
  return `${ptBr(truncate ? percent.toFixed(2, Dec.ROUND_DOWN) : percent.toFixed(2))}%`;
}

/** Diferença em pontos percentuais: 0.015 → "1,50 p.p.". */
export function formatPoints(value: Dec): string {
  return `${ptBr(value.times(100).toFixed(2))} p.p.`;
}
