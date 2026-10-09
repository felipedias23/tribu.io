import type { FatorRParameters } from '../tax-rules/simples-fator-r.parameters';
import {
  type FatorRInput,
  type FatorROutcome,
  formatCnae,
  type TraceStep,
} from './evaluation';
import { evaluateSimplesFatorR } from './simples-fator-r.evaluator';

/** Premissa do @1 que a D33 transforma em dado confirmado. */
const ACTIVITY_ASSUMPTION = 'ATIVIDADE_SUJEITA_FATOR_R';

function eligibilityStep(input: FatorRInput): TraceStep {
  const activity = input.cnae
    ? `A atividade (CNAE ${formatCnae(input.cnae)})`
    : 'A atividade';
  return {
    code: 'ELEGIBILIDADE',
    description: `${activity} está sujeita ao Fator R, como confirmado no perfil tributário (LC 123/2006, art. 18, §§ 5º-I e 5º-M).`,
    values: { fatorRSubject: 'true' },
  };
}

/**
 * Evaluator SIMPLES_FATOR_R@2 (D33): o @1, que não muda, com a elegibilidade
 * da atividade confirmada no perfil em vez de presumida. Atividade não
 * sujeita: a regra não se aplica. Sem confirmação: INCOMPLETE, nada é
 * calculado.
 */
export function evaluateSimplesFatorRV2(
  input: FatorRInput,
  parameters: FatorRParameters,
): FatorROutcome {
  if (input.taxRegime !== null && input.taxRegime !== 'SIMPLES_NACIONAL') {
    return evaluateSimplesFatorR(input, parameters);
  }
  if (input.fatorRSubject === false) {
    return {
      status: 'NOT_APPLICABLE',
      code: 'ACTIVITY_NOT_SUBJECT',
      message:
        'A atividade não está sujeita ao Fator R (LC 123/2006, art. 18, §§ 5º-I e 5º-M), como indicado no perfil tributário.',
      trace: [],
      assumptions: [],
    };
  }

  const outcome = evaluateSimplesFatorR(input, parameters);
  const assumptions = outcome.assumptions.filter(
    (a) => a.code !== ACTIVITY_ASSUMPTION,
  );
  if (input.fatorRSubject == null) {
    return {
      status: 'INCOMPLETE',
      missing: [
        ...(outcome.status === 'INCOMPLETE' ? outcome.missing : []),
        'fatorRSubject',
      ],
      trace: [],
      assumptions,
    };
  }
  if (outcome.status === 'INCOMPLETE') return { ...outcome, assumptions };
  return {
    ...outcome,
    trace: [eligibilityStep(input), ...outcome.trace],
    assumptions,
  };
}
