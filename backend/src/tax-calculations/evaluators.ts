import {
  type FatorRParameters,
  fatorRParametersSchema,
  SIMPLES_FATOR_R_EVALUATOR,
  SIMPLES_FATOR_R_EVALUATOR_V2,
} from '../tax-rules/simples-fator-r.parameters';
import type { FatorRInput, FatorROutcome } from './evaluation';
import { evaluateSimplesFatorR } from './simples-fator-r.evaluator';
import { evaluateSimplesFatorRV2 } from './simples-fator-r-v2.evaluator';

/**
 * Evaluators publicados, por chave (§3.4). Um evaluator publicado não muda:
 * uma alteração de lógica gera uma chave nova (ex.: SIMPLES_FATOR_R@2).
 */
const EVALUATORS: Record<
  string,
  (input: FatorRInput, parameters: FatorRParameters) => FatorROutcome
> = {
  // @1 fica registado para reproduzir as análises feitas com a versão 1.
  [SIMPLES_FATOR_R_EVALUATOR]: evaluateSimplesFatorR,
  [SIMPLES_FATOR_R_EVALUATOR_V2]: evaluateSimplesFatorRV2,
};

/** Versão de regra vinda do banco, já selecionada para o período. */
export interface RuleVersionForEvaluation {
  evaluatorKey: string;
  parameters: unknown;
}

/**
 * Valida os parâmetros da versão e corre o evaluator da sua chave. Uma chave
 * desconhecida ou parâmetros inválidos são erros de configuração: lançam.
 */
export function evaluate(
  version: RuleVersionForEvaluation,
  input: FatorRInput,
): FatorROutcome {
  const evaluator = EVALUATORS[version.evaluatorKey];
  if (!evaluator) {
    throw new Error(`Evaluator desconhecido: ${version.evaluatorKey}.`);
  }
  return evaluator(input, fatorRParametersSchema.parse(version.parameters));
}
