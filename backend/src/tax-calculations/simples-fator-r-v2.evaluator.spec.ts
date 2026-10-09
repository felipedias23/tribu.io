import type { FatorRInput, FatorROutcome } from './evaluation';
import { evaluate } from './evaluators';
import { evaluateSimplesFatorR } from './simples-fator-r.evaluator';
import { evaluateSimplesFatorRV2 } from './simples-fator-r-v2.evaluator';
import { FATOR_R_V1, FATOR_R_V2_VERSION } from './simples-fator-r-v1.fixture';

function input(data: Partial<FatorRInput> = {}): FatorRInput {
  return {
    taxRegime: 'SIMPLES_NACIONAL',
    cnae: '7111100',
    revenue12m: '1200000.00',
    payroll12m: '360000.00',
    referencePeriod: '2026-09',
    fatorRSubject: true,
    ...data,
  };
}

const v1 = (data: Partial<FatorRInput> = {}) =>
  evaluateSimplesFatorR(input(data), FATOR_R_V1);
const v2 = (data: Partial<FatorRInput> = {}) =>
  evaluateSimplesFatorRV2(input(data), FATOR_R_V1);

const codes = (outcome: FatorROutcome, key: 'trace' | 'assumptions') =>
  outcome[key].map((item) => item.code);

describe('SIMPLES_FATOR_R@2 (D33)', () => {
  describe('atividade sujeita ao Fator R', () => {
    it('calcula como o @1, com a elegibilidade como passo confirmado', () => {
      const outcome = v2();

      expect(outcome.status).toBe('COMPLETED');
      const old = v1();
      expect('result' in outcome && outcome.result).toEqual(
        'result' in old && old.result,
      );
      expect('result' in old && old.result).toBeTruthy();
      expect(codes(outcome, 'trace')).toEqual([
        'ELEGIBILIDADE',
        'FATOR_R',
        'ANEXO',
        'FAIXA',
        'ALIQUOTA_EFETIVA',
      ]);
      expect(outcome.trace[0]).toEqual({
        code: 'ELEGIBILIDADE',
        description:
          'A atividade (CNAE 7111-1/00) está sujeita ao Fator R, como confirmado no perfil tributário (LC 123/2006, art. 18, §§ 5º-I e 5º-M).',
        values: { fatorRSubject: 'true' },
      });
    });

    it('a elegibilidade deixa de ser premissa', () => {
      expect(codes(v1(), 'assumptions')).toContain('ATIVIDADE_SUJEITA_FATOR_R');
      expect(codes(v2(), 'assumptions')).toEqual(['PERIODO_12_MESES']);
    });

    it('sem CNAE, o passo não cita o código', () => {
      expect(v2({ cnae: null }).trace[0].description).toMatch(
        /^A atividade está sujeita ao Fator R/,
      );
    });

    it('sem cálculo possível, mantém o motivo e o passo da elegibilidade', () => {
      const outcome = v2({ revenue12m: '0.00', payroll12m: '0.00' });

      expect(outcome).toMatchObject({
        status: 'NOT_COMPUTABLE',
        code: 'REVENUE_ZERO',
      });
      expect(codes(outcome, 'trace')).toEqual(['ELEGIBILIDADE']);
      expect(codes(outcome, 'assumptions')).toEqual(['PERIODO_12_MESES']);
    });

    it('com outros dados em falta, fica INCOMPLETE sem a premissa antiga', () => {
      const outcome = v2({ payroll12m: null });

      expect(outcome).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['payroll12m'],
      });
      expect(codes(outcome, 'assumptions')).toEqual(['PERIODO_12_MESES']);
    });
  });

  describe('atividade não sujeita ao Fator R', () => {
    it('a regra não se aplica, mesmo com dados em falta', () => {
      const outcome = v2({ fatorRSubject: false, payroll12m: null });

      expect(outcome).toEqual({
        status: 'NOT_APPLICABLE',
        code: 'ACTIVITY_NOT_SUBJECT',
        message:
          'A atividade não está sujeita ao Fator R (LC 123/2006, art. 18, §§ 5º-I e 5º-M), como indicado no perfil tributário.',
        trace: [],
        assumptions: [],
      });
    });

    it('fora do Simples, o motivo continua a ser o regime', () => {
      expect(
        v2({ taxRegime: 'LUCRO_PRESUMIDO', fatorRSubject: false }),
      ).toMatchObject({ status: 'NOT_APPLICABLE', code: 'REGIME_NOT_SIMPLES' });
    });
  });

  describe('elegibilidade não informada', () => {
    it('não presume "sim": INCOMPLETE, sem cálculo', () => {
      const outcome = v2({ fatorRSubject: null });

      expect(outcome).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['fatorRSubject'],
        trace: [],
      });
    });

    it('junta-se aos outros campos em falta, no fim', () => {
      expect(
        v2({ fatorRSubject: null, taxRegime: null, revenue12m: null }),
      ).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['taxRegime', 'revenue12m', 'fatorRSubject'],
      });
    });

    it('um snapshot sem o campo conta como não informado', () => {
      const { fatorRSubject: _omitted, ...old } = input();

      expect(evaluateSimplesFatorRV2(old, FATOR_R_V1)).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['fatorRSubject'],
      });
    });
  });

  describe('versões', () => {
    it('o @1 não muda: ignora o campo novo e reproduz as análises antigas', () => {
      const { fatorRSubject: _omitted, ...old } = input();

      expect(v1({ fatorRSubject: false })).toStrictEqual(
        evaluateSimplesFatorR(old, FATOR_R_V1),
      );
      expect(v1({ fatorRSubject: false }).status).toBe('COMPLETED');
    });

    it('o registo corre o @2 para a versão 2', () => {
      expect(evaluate(FATOR_R_V2_VERSION, input())).toStrictEqual(v2());
      expect(
        evaluate(FATOR_R_V2_VERSION, input({ fatorRSubject: false })).status,
      ).toBe('NOT_APPLICABLE');
    });
  });
});
