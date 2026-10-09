import type { FatorRInput, FatorROutcome } from './evaluation';
import { evaluate } from './evaluators';
import { evaluateSimplesFatorR } from './simples-fator-r.evaluator';
import { FATOR_R_V1, FATOR_R_V1_VERSION } from './simples-fator-r-v1.fixture';

function input(data: Partial<FatorRInput> = {}): FatorRInput {
  return {
    taxRegime: 'SIMPLES_NACIONAL',
    cnae: '6201501',
    revenue12m: '1200000.00',
    payroll12m: '360000.00',
    referencePeriod: '2026-09',
    ...data,
  };
}

function completed(outcome: FatorROutcome) {
  if (outcome.status !== 'COMPLETED') {
    throw new Error(`esperava COMPLETED, veio ${outcome.status}`);
  }
  return outcome;
}

const run = (data: Partial<FatorRInput> = {}) =>
  evaluateSimplesFatorR(input(data), FATOR_R_V1);

describe('SIMPLES_FATOR_R@1', () => {
  describe('anexo pelo Fator R (art. 18, §§ 5º-J e 5º-M)', () => {
    it.each([
      ['exatamente 28%', '1000000.00', '280000.00', '0.28', 'III'],
      [
        'um cêntimo abaixo de 28%',
        '1000000.00',
        '279999.99',
        '0.27999999',
        'V',
      ],
      ['acima de 28%', '1000000.00', '300000.00', '0.3', 'III'],
      ['folha zero', '1000000.00', '0.00', '0', 'V'],
    ])('%s', (_case, revenue12m, payroll12m, fatorR, annex) => {
      const { result } = completed(run({ revenue12m, payroll12m }));

      expect(result.fatorR).toBe(fatorR);
      expect(result.annex).toBe(annex);
    });

    it('28% exatos ficam no Anexo III, onde a vírgula flutuante daria 27,999…%', () => {
      // Em JavaScript, 28000.07 / 100000.25 = 0.27999999999999997.
      expect(28000.07 / 100000.25).toBeLessThan(0.28);

      const { result } = completed(
        run({ revenue12m: '100000.25', payroll12m: '28000.07' }),
      );

      expect(result.fatorR).toBe('0.28');
      expect(result.annex).toBe('III');
    });
  });

  describe('faixa e alíquota efetiva (art. 18, § 1º-A)', () => {
    // Valores esperados calculados à parte (Python, decimal, metade para cima).
    it.each([
      ['100000.00', 1, '0.0600', '0.1550'],
      ['180000.00', 1, '0.0600', '0.1550'],
      ['180000.01', 2, '0.0600', '0.1550'],
      ['360000.00', 2, '0.0860', '0.1675'],
      ['500000.00', 3, '0.0997', '0.1752'],
      ['720000.01', 4, '0.1105', '0.1813'],
      ['1200000.00', 4, '0.1303', '0.1908'],
      ['1800000.00', 4, '0.1402', '0.1955'],
      ['2400000.00', 5, '0.1577', '0.2041'],
      ['3600000.01', 6, '0.1500', '0.1550'],
      ['4800000.00', 6, '0.1950', '0.1925'],
    ])(
      'RBT12 %s: faixa %i, Anexo III %s, Anexo V %s',
      (revenue12m, bracket, rateIII, rateV) => {
        const revenue = Number(revenue12m);
        const anexoIII = completed(
          run({ revenue12m, payroll12m: (revenue * 0.3).toFixed(2) }),
        );
        const anexoV = completed(
          run({ revenue12m, payroll12m: (revenue * 0.1).toFixed(2) }),
        );

        expect(anexoIII.result).toMatchObject({
          annex: 'III',
          bracket,
          effectiveRate: rateIII,
        });
        expect(anexoV.result).toMatchObject({
          annex: 'V',
          bracket,
          effectiveRate: rateV,
        });
      },
    );

    it('devolve a alíquota nominal e a parcela da faixa', () => {
      const { result } = completed(
        run({ revenue12m: '2400000.00', payroll12m: '720000.00' }),
      );

      expect(result).toMatchObject({
        nominalRate: '0.21',
        deduction: '125640.00',
      });
    });
  });

  describe('dados ausentes (D20): nada é inventado', () => {
    it('lista todos os campos obrigatórios em falta', () => {
      const outcome = run({ payroll12m: null, referencePeriod: null });

      expect(outcome).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['payroll12m', 'referencePeriod'],
      });
    });

    it('sem regime, lista o regime e os outros campos em falta', () => {
      expect(run({ taxRegime: null, revenue12m: null })).toMatchObject({
        status: 'INCOMPLETE',
        missing: ['taxRegime', 'revenue12m'],
      });
    });

    it('zero é um valor conhecido, não um dado ausente', () => {
      expect(run({ payroll12m: '0.00' }).status).toBe('COMPLETED');
    });

    it('o CNAE não é obrigatório: a elegibilidade é uma premissa', () => {
      const outcome = completed(run({ cnae: null }));

      expect(outcome.assumptions[0].description).toContain('A atividade é');
    });
  });

  describe('casos sem cálculo', () => {
    it('não se aplica fora do Simples Nacional', () => {
      for (const taxRegime of ['LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
        expect(run({ taxRegime, payroll12m: null })).toMatchObject({
          status: 'NOT_APPLICABLE',
          code: 'REGIME_NOT_SIMPLES',
        });
      }
    });

    it('RBT12 zero não tem base de cálculo', () => {
      expect(run({ revenue12m: '0.00' })).toMatchObject({
        status: 'NOT_COMPUTABLE',
        code: 'REVENUE_ZERO',
      });
    });

    it('RBT12 acima do limite do regime não tem faixa', () => {
      const outcome = run({ revenue12m: '4800000.01' });

      expect(outcome).toMatchObject({
        status: 'NOT_COMPUTABLE',
        code: 'REVENUE_ABOVE_LIMIT',
      });
      expect(outcome.trace.map((step) => step.code)).toEqual([
        'FATOR_R',
        'ANEXO',
      ]);
    });
  });

  describe('explicação (US11)', () => {
    it('mostra os quatro passos, com os valores usados', () => {
      const { trace } = completed(run());

      expect(trace.map((step) => step.code)).toEqual([
        'FATOR_R',
        'ANEXO',
        'FAIXA',
        'ALIQUOTA_EFETIVA',
      ]);
      expect(trace[0].description).toBe(
        'Fator R = folha ÷ RBT12 = R$ 360.000,00 ÷ R$ 1.200.000,00 = 30,00%.',
      );
      expect(trace[1].description).toBe(
        '30,00% é igual ou superior a 28,00%: Anexo III.',
      );
      expect(trace[2].values).toEqual({
        bracket: '4',
        upTo: '1800000.00',
        nominalRate: '0.16',
        deduction: '35640.00',
      });
      expect(trace[3].values).toEqual({ effectiveRate: '0.1303' });
    });

    it('um Fator R abaixo do limiar nunca aparece igual a ele', () => {
      const { trace } = completed(
        run({ revenue12m: '1000000.00', payroll12m: '279999.99' }),
      );

      expect(trace[1].description).toBe('27,99% é inferior a 28,00%: Anexo V.');
    });

    it('declara as premissas do cálculo, com o CNAE', () => {
      const { assumptions } = completed(run());

      expect(assumptions.map((a) => a.code)).toEqual([
        'ATIVIDADE_SUJEITA_FATOR_R',
        'PERIODO_12_MESES',
      ]);
      expect(assumptions[0].description).toContain('CNAE 6201501');
    });
  });

  describe('reprodutibilidade (replay)', () => {
    it('a mesma entrada e a mesma versão dão um resultado idêntico', () => {
      const first = run({ revenue12m: '987654.32', payroll12m: '123456.78' });
      const again = run({ revenue12m: '987654.32', payroll12m: '123456.78' });

      expect(again).toStrictEqual(first);
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    });

    it('não depende da ordem das chaves da entrada', () => {
      const data = input();
      const reversed = Object.fromEntries(
        Object.entries(data).reverse(),
      ) as unknown as FatorRInput;

      expect(evaluateSimplesFatorR(reversed, FATOR_R_V1)).toStrictEqual(
        evaluateSimplesFatorR(data, FATOR_R_V1),
      );
    });

    it('o resultado sobrevive a uma ida e volta por JSON (snapshot da análise)', () => {
      const outcome = run();

      expect(JSON.parse(JSON.stringify(outcome))).toStrictEqual(outcome);
    });
  });

  describe('registo de evaluators', () => {
    it('corre o evaluator da chave da versão, validando os parâmetros', () => {
      expect(evaluate(FATOR_R_V1_VERSION, input())).toStrictEqual(run());
    });

    it('recusa uma chave desconhecida', () => {
      expect(() =>
        evaluate({ ...FATOR_R_V1_VERSION, evaluatorKey: 'OUTRA@1' }, input()),
      ).toThrow('Evaluator desconhecido: OUTRA@1.');
    });

    it('valida os parâmetros antes de calcular', () => {
      // Parâmetros que o evaluator conseguiria usar, mas que o esquema recusa.
      expect(() =>
        evaluate(
          {
            ...FATOR_R_V1_VERSION,
            parameters: { ...FATOR_R_V1, extra: '1' },
          },
          input(),
        ),
      ).toThrow(/unrecognized/i);
    });
  });
});
