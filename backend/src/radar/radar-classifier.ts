import {
  Dec,
  type FatorRInput,
  type FatorROutcome,
  formatPercent,
  formatPoints,
  missingFields,
  type RequiredField,
} from '../tax-calculations/evaluation';
import { evaluate } from '../tax-calculations/evaluators';
import { fatorRParametersSchema } from '../tax-rules/simples-fator-r.parameters';

/** Estados do Tax Radar, pela ordem de precedência da §3.5 (D29). */
export const RADAR_STATUSES = [
  'DADOS_INCOMPLETOS',
  'REVISAR_REGRA',
  'REQUER_ANALISE',
  'OPORTUNIDADE_PARA_AVALIAR',
  'NORMAL',
] as const;
export type RadarStatus = (typeof RADAR_STATUSES)[number];

/** Peso de cada estado na pontuação de prioridade (D30). */
export const PRIORITY_WEIGHTS: Record<RadarStatus, number> = {
  REQUER_ANALISE: 4,
  OPORTUNIDADE_PARA_AVALIAR: 3,
  REVISAR_REGRA: 2,
  DADOS_INCOMPLETOS: 1,
  NORMAL: 0,
};

export interface RadarReason {
  code: string;
  message: string;
}

/** Versão publicada da regra, vigente no mês de referência do perfil. */
export interface RadarRuleVersion {
  id: string;
  version: number;
  evaluatorKey: string;
  parameters: unknown;
}

export interface RadarInput {
  /** Perfil tributário atual; null = empresa sem perfil. */
  profile: FatorRInput | null;
  /** null = nenhuma versão publicada vale no mês de referência. */
  ruleVersion: RadarRuleVersion | null;
  /** Versão usada na última análise da empresa; null = nunca analisada. */
  lastAnalysisRuleVersionId: string | null;
  /** Mês atual, AAAA-MM. Vem de quem chama: a função é pura. */
  currentPeriod: string;
}

export interface RadarSignal {
  status: RadarStatus;
  priorityScore: number;
  reasons: RadarReason[];
  /** Versão usada no cálculo; null se não houve cálculo. */
  ruleVersion: { id: string; version: number; evaluatorKey: string } | null;
  /** Resultado, trace e premissas do cálculo (US11); null se não houve. */
  evaluation: FatorROutcome | null;
}

const FIELD_LABELS: Record<RequiredField, string> = {
  taxRegime: 'regime tributário',
  revenue12m: 'receita bruta dos 12 meses (RBT12)',
  payroll12m: 'folha dos 12 meses',
  referencePeriod: 'mês de referência',
};

/** Meses desde o ano 0, para comparar meses AAAA-MM. */
function monthIndex(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return year * 12 + (month - 1);
}

/** Desempate da D30: ⌊999 × (1 − |Fator R − limiar|)⌋, ou 0 sem Fator R. */
function tieBreak(evaluation: FatorROutcome | null, threshold: Dec | null) {
  if (evaluation?.status !== 'COMPLETED' || threshold === null) return 0;
  const distance = Dec.min(
    new Dec(evaluation.result.fatorR).minus(threshold).abs(),
    1,
  );
  return new Dec(1)
    .minus(distance)
    .times(999)
    .toDecimalPlaces(0, Dec.ROUND_FLOOR)
    .toNumber();
}

function signal(
  status: RadarStatus,
  reasons: RadarReason[],
  input: RadarInput,
  evaluation: FatorROutcome | null = null,
  threshold: Dec | null = null,
): RadarSignal {
  const version = evaluation ? input.ruleVersion : null;
  return {
    status,
    priorityScore:
      PRIORITY_WEIGHTS[status] * 1000 + tieBreak(evaluation, threshold),
    reasons,
    ruleVersion: version
      ? {
          id: version.id,
          version: version.version,
          evaluatorKey: version.evaluatorKey,
        }
      : null,
    evaluation,
  };
}

/**
 * Classifica uma empresa no Tax Radar (§3.5, D26, D29, D30). Função pura: o
 * mesmo input dá sempre o mesmo sinal. Os estados são sinais para o
 * contador, não decisões tributárias.
 */
export function classify(input: RadarInput): RadarSignal {
  const { profile, ruleVersion } = input;

  // 1. DADOS_INCOMPLETOS
  if (profile === null) {
    return signal(
      'DADOS_INCOMPLETOS',
      [
        {
          code: 'NO_PROFILE',
          message: 'A empresa ainda não tem perfil tributário.',
        },
      ],
      input,
    );
  }
  if (profile.taxRegime !== null && profile.taxRegime !== 'SIMPLES_NACIONAL') {
    return signal(
      'NORMAL',
      [
        {
          code: 'RULE_NOT_APPLICABLE',
          message:
            'O Fator R só se aplica ao Simples Nacional; a empresa está noutro regime.',
        },
      ],
      input,
    );
  }
  const missing = missingFields(profile);
  if (missing.length > 0) {
    return signal(
      'DADOS_INCOMPLETOS',
      [
        {
          code: 'MISSING_DATA',
          message: `Faltam dados para o cálculo: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}.`,
        },
      ],
      input,
    );
  }
  const referencePeriod = profile.referencePeriod as string;

  // 2. REVISAR_REGRA
  if (ruleVersion === null) {
    return signal(
      'REVISAR_REGRA',
      [
        {
          code: 'NO_RULE_VERSION',
          message: `Nenhuma versão publicada da regra vale para ${referencePeriod}.`,
        },
      ],
      input,
    );
  }
  const parameters = fatorRParametersSchema.parse(ruleVersion.parameters);
  const threshold = new Dec(parameters.threshold);
  const evaluation = evaluate(ruleVersion, profile);
  if (
    input.lastAnalysisRuleVersionId !== null &&
    input.lastAnalysisRuleVersionId !== ruleVersion.id
  ) {
    return signal(
      'REVISAR_REGRA',
      [
        {
          code: 'ANALYSIS_RULE_OUTDATED',
          message: `A última análise usou uma versão da regra que já não é a vigente (agora: versão ${ruleVersion.version}).`,
        },
      ],
      input,
      evaluation,
      threshold,
    );
  }

  // 3. REQUER_ANALISE
  const review: RadarReason[] = [];
  if (evaluation.status === 'NOT_COMPUTABLE') {
    review.push({ code: evaluation.code, message: evaluation.message });
  }
  const revenue = new Dec(profile.revenue12m as string);
  const payroll = new Dec(profile.payroll12m as string);
  if (payroll.gt(revenue)) {
    review.push({
      code: 'PAYROLL_EXCEEDS_REVENUE',
      message:
        'A folha dos 12 meses é maior do que a receita bruta: confirme os dados.',
    });
  }
  const age = monthIndex(input.currentPeriod) - monthIndex(referencePeriod);
  if (age < 0) {
    review.push({
      code: 'REFERENCE_IN_FUTURE',
      message: `O mês de referência (${referencePeriod}) está no futuro.`,
    });
  } else if (age > parameters.maxReferenceAgeMonths) {
    review.push({
      code: 'REFERENCE_OUTDATED',
      message: `Os dados são de ${referencePeriod}, há ${age} meses; o máximo é ${parameters.maxReferenceAgeMonths}.`,
    });
  }
  if (review.length > 0) {
    return signal('REQUER_ANALISE', review, input, evaluation, threshold);
  }
  if (evaluation.status !== 'COMPLETED') {
    // Os casos INCOMPLETE e NOT_APPLICABLE já foram tratados acima.
    throw new Error(`Resultado inesperado do evaluator: ${evaluation.status}.`);
  }

  // 4. OPORTUNIDADE_PARA_AVALIAR
  const fatorR = new Dec(evaluation.result.fatorR);
  const distance = fatorR.minus(threshold).abs();
  if (distance.lt(new Dec(parameters.opportunityMargin))) {
    const below = fatorR.lt(threshold);
    return signal(
      'OPORTUNIDADE_PARA_AVALIAR',
      [
        {
          code: below ? 'NEAR_THRESHOLD_BELOW' : 'NEAR_THRESHOLD_ABOVE',
          message: below
            ? `Fator R de ${formatPercent(fatorR, true)}, a ${formatPoints(distance)} do limiar de ${formatPercent(threshold, true)}: com mais folha, a empresa pode passar ao Anexo III.`
            : `Fator R de ${formatPercent(fatorR, true)}, só ${formatPoints(distance)} acima do limiar de ${formatPercent(threshold, true)}: uma redução da folha levaria a empresa ao Anexo V.`,
        },
      ],
      input,
      evaluation,
      threshold,
    );
  }

  // 5. NORMAL
  return signal(
    'NORMAL',
    [
      {
        code: 'FATOR_R_OK',
        message: `Fator R de ${formatPercent(fatorR, true)}: Anexo ${evaluation.result.annex}, alíquota efetiva de ${formatPercent(new Dec(evaluation.result.effectiveRate))}.`,
      },
    ],
    input,
    evaluation,
    threshold,
  );
}
