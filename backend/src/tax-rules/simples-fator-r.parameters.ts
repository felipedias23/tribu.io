import { z } from 'zod';
import { Decimal } from 'decimal.js';

export const SIMPLES_FATOR_R_CODE = 'SIMPLES_FATOR_R';
export const SIMPLES_FATOR_R_EVALUATOR = 'SIMPLES_FATOR_R@1';

/** Número decimal não negativo escrito como texto, para não perder precisão. */
const decimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'deve ser um decimal não negativo em texto');

const bracketSchema = z
  .object({
    /** Limite superior da faixa de RBT12, inclusivo. */
    upTo: decimal,
    /** Alíquota nominal, como fração (0.06 = 6%). */
    nominalRate: decimal,
    /** Parcela a deduzir, em reais. */
    deduction: decimal,
  })
  .strict();

const annexSchema = z.array(bracketSchema).min(1);

/** Forma dos parâmetros. As regras entre campos ficam no esquema exportado. */
const fatorRParametersShape = z
  .object({
    /** Fator R a partir do qual se aplica o Anexo III (0.28). */
    threshold: decimal,
    /** Distância ao limiar que conta como oportunidade (0.03 = 3 p.p.). */
    opportunityMargin: decimal,
    /** Idade máxima do mês de referência, em meses. */
    maxReferenceAgeMonths: z.number().int().positive(),
    /** RBT12 máximo do regime. */
    revenueLimit: decimal,
    annexes: z.object({ III: annexSchema, V: annexSchema }).strict(),
  })
  .strict();

type FatorRParametersShape = z.infer<typeof fatorRParametersShape>;

/**
 * Parâmetros do evaluator SIMPLES_FATOR_R@1 (decisões D28 e D29). Os valores
 * da versão 1 estão na §3.4.1 de docs/arquitetura-e-decisoes.md. As regras
 * entre campos só correm depois de a forma estar válida (`pipe`): sem isso,
 * um decimal mal escrito ou um anexo vazio lançariam uma exceção.
 */
export const fatorRParametersSchema = fatorRParametersShape.pipe(
  z.custom<FatorRParametersShape>().superRefine((parameters, ctx) => {
    const d = (value: string) => new Decimal(value);
    const one = d('1');

    for (const key of ['threshold', 'opportunityMargin'] as const) {
      if (d(parameters[key]).lte(0) || d(parameters[key]).gte(one)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'deve estar entre 0 e 1',
        });
      }
    }

    for (const annex of ['III', 'V'] as const) {
      const brackets = parameters.annexes[annex];
      brackets.forEach((bracket, index) => {
        const path = ['annexes', annex, index];
        const rate = d(bracket.nominalRate);
        if (rate.lte(0) || rate.gte(one)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'nominalRate'],
            message: 'deve estar entre 0 e 1',
          });
        }
        if (index > 0 && d(bracket.upTo).lte(d(brackets[index - 1].upTo))) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'upTo'],
            message: 'as faixas devem estar por ordem crescente',
          });
        }
      });
      const last = brackets[brackets.length - 1];
      if (!d(last.upTo).eq(d(parameters.revenueLimit))) {
        ctx.addIssue({
          code: 'custom',
          path: ['annexes', annex],
          message: 'a última faixa deve terminar no limite do regime',
        });
      }
    }
  }),
);

export type FatorRParameters = z.infer<typeof fatorRParametersSchema>;
