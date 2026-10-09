import type { FatorRParameters } from '../tax-rules/simples-fator-r.parameters';
import {
  type Assumption,
  Dec,
  formatBrl as brl,
  formatPercent,
  type FatorRInput,
  type FatorROutcome,
  type RequiredField,
  type TraceStep,
} from './evaluation';

/** Premissas do cálculo (D28), sempre mostradas ao contador. */
function assumptions(input: FatorRInput): Assumption[] {
  const activity = input.cnae
    ? `A atividade (CNAE ${input.cnae})`
    : 'A atividade';
  return [
    {
      code: 'ATIVIDADE_SUJEITA_FATOR_R',
      description: `${activity} é tratada como sujeita ao Fator R (LC 123/2006, art. 18, §§ 5º-I, 5º-J e 5º-M). A elegibilidade pelo CNAE não é verificada.`,
    },
    {
      code: 'PERIODO_12_MESES',
      description:
        'A receita bruta (RBT12) e a folha correspondem aos 12 meses anteriores ao mês de referência (art. 18, § 5º-K).',
    },
  ];
}

const REQUIRED: RequiredField[] = [
  'revenue12m',
  'payroll12m',
  'referencePeriod',
];

/**
 * Evaluator SIMPLES_FATOR_R@1 (D28): função pura, sem I/O. Fator R = folha ÷
 * RBT12; com o limiar ou mais, Anexo III, abaixo, Anexo V (art. 18, §§ 5º-J e
 * 5º-M). Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷
 * RBT12 (art. 18, § 1º-A).
 */
export function evaluateSimplesFatorR(
  input: FatorRInput,
  parameters: FatorRParameters,
): FatorROutcome {
  if (input.taxRegime === null) {
    return {
      status: 'INCOMPLETE',
      missing: ['taxRegime', ...REQUIRED.filter((f) => input[f] === null)],
      trace: [],
      assumptions: [],
    };
  }
  if (input.taxRegime !== 'SIMPLES_NACIONAL') {
    return {
      status: 'NOT_APPLICABLE',
      code: 'REGIME_NOT_SIMPLES',
      message:
        'O Fator R só se aplica a empresas do Simples Nacional; o regime informado é outro.',
      trace: [],
      assumptions: [],
    };
  }

  const missing = REQUIRED.filter((field) => input[field] === null);
  if (missing.length > 0) {
    return {
      status: 'INCOMPLETE',
      missing,
      trace: [],
      assumptions: assumptions(input),
    };
  }

  const revenue = new Dec(input.revenue12m as string);
  const payroll = new Dec(input.payroll12m as string);
  const trace: TraceStep[] = [];

  if (revenue.isZero()) {
    return {
      status: 'NOT_COMPUTABLE',
      code: 'REVENUE_ZERO',
      message:
        'Sem receita nos últimos 12 meses (RBT12 = 0), o Fator R não tem base de cálculo. O início de atividade segue regras próprias, fora deste cálculo.',
      trace,
      assumptions: assumptions(input),
    };
  }

  const fatorR = payroll.dividedBy(revenue);
  const threshold = new Dec(parameters.threshold);
  const annex = fatorR.gte(threshold) ? 'III' : 'V';
  trace.push(
    {
      code: 'FATOR_R',
      description: `Fator R = folha ÷ RBT12 = ${brl(payroll)} ÷ ${brl(revenue)} = ${formatPercent(fatorR, true)}.`,
      values: {
        payroll12m: payroll.toFixed(2),
        revenue12m: revenue.toFixed(2),
        fatorR: fatorR.toString(),
      },
    },
    {
      code: 'ANEXO',
      description:
        annex === 'III'
          ? `${formatPercent(fatorR, true)} é igual ou superior a ${formatPercent(threshold)}: Anexo III.`
          : `${formatPercent(fatorR, true)} é inferior a ${formatPercent(threshold)}: Anexo V.`,
      values: { threshold: parameters.threshold, annex },
    },
  );

  const brackets = parameters.annexes[annex];
  const index = brackets.findIndex((b) => revenue.lte(new Dec(b.upTo)));
  if (index === -1) {
    return {
      status: 'NOT_COMPUTABLE',
      code: 'REVENUE_ABOVE_LIMIT',
      message: `O RBT12 de ${brl(revenue)} ultrapassa o limite do Simples Nacional (${brl(new Dec(parameters.revenueLimit))}).`,
      trace,
      assumptions: assumptions(input),
    };
  }

  const bracket = brackets[index];
  const nominalRate = new Dec(bracket.nominalRate);
  const deduction = new Dec(bracket.deduction);
  const effectiveRate = revenue
    .times(nominalRate)
    .minus(deduction)
    .dividedBy(revenue);
  trace.push(
    {
      code: 'FAIXA',
      description: `RBT12 de ${brl(revenue)} está na ${index + 1}.ª faixa do Anexo ${annex} (até ${brl(new Dec(bracket.upTo))}): alíquota nominal de ${formatPercent(nominalRate)} e parcela a deduzir de ${brl(deduction)}.`,
      values: {
        bracket: String(index + 1),
        upTo: bracket.upTo,
        nominalRate: bracket.nominalRate,
        deduction: bracket.deduction,
      },
    },
    {
      code: 'ALIQUOTA_EFETIVA',
      description: `Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 = ${formatPercent(effectiveRate)}.`,
      values: { effectiveRate: effectiveRate.toFixed(4) },
    },
  );

  return {
    status: 'COMPLETED',
    result: {
      fatorR: fatorR.toString(),
      annex,
      bracket: index + 1,
      nominalRate: bracket.nominalRate,
      deduction: bracket.deduction,
      effectiveRate: effectiveRate.toFixed(4),
    },
    trace,
    assumptions: assumptions(input),
  };
}
