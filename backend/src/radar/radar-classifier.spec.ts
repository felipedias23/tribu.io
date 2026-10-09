import type { FatorRInput } from '../tax-calculations/evaluation';
import { FATOR_R_V1_VERSION } from '../tax-calculations/simples-fator-r-v1.fixture';
import { classify, type RadarInput } from './radar-classifier';

function profile(data: Partial<FatorRInput> = {}): FatorRInput {
  return {
    taxRegime: 'SIMPLES_NACIONAL',
    cnae: '6201501',
    revenue12m: '1000000.00',
    payroll12m: '400000.00',
    referencePeriod: '2026-09',
    ...data,
  };
}

function radar(
  data: Partial<FatorRInput> | null = {},
  extra: Partial<RadarInput> = {},
) {
  return classify({
    profile: data === null ? null : profile(data),
    ruleVersion: FATOR_R_V1_VERSION,
    lastAnalysisRuleVersionId: null,
    currentPeriod: '2026-10',
    ...extra,
  });
}

const codes = (signal: ReturnType<typeof classify>) =>
  signal.reasons.map((reason) => reason.code);

describe('Classificador do Tax Radar (§3.5, D29, D30)', () => {
  describe('1. DADOS_INCOMPLETOS', () => {
    it('empresa sem perfil', () => {
      const signal = radar(null);

      expect(signal).toMatchObject({
        status: 'DADOS_INCOMPLETOS',
        priorityScore: 1000,
        evaluation: null,
        ruleVersion: null,
      });
      expect(codes(signal)).toEqual(['NO_PROFILE']);
    });

    it('no Simples, lista os campos em falta', () => {
      const signal = radar({ payroll12m: null, referencePeriod: null });

      expect(signal.status).toBe('DADOS_INCOMPLETOS');
      expect(signal.reasons[0]).toEqual({
        code: 'MISSING_DATA',
        message:
          'Faltam dados para o cálculo: folha dos 12 meses, mês de referência.',
      });
    });

    it('sem regime, o regime também falta', () => {
      expect(radar({ taxRegime: null }).reasons[0].message).toBe(
        'Faltam dados para o cálculo: regime tributário.',
      );
    });

    it('tem precedência sobre a falta de versão da regra', () => {
      expect(radar({ revenue12m: null }, { ruleVersion: null }).status).toBe(
        'DADOS_INCOMPLETOS',
      );
    });
  });

  describe('fora do Simples Nacional', () => {
    it('é NORMAL, com o motivo, mesmo com dados em falta', () => {
      for (const taxRegime of ['LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
        const signal = radar({ taxRegime, payroll12m: null });

        expect(signal).toMatchObject({
          status: 'NORMAL',
          priorityScore: 0,
          evaluation: null,
        });
        expect(codes(signal)).toEqual(['RULE_NOT_APPLICABLE']);
      }
    });
  });

  describe('2. REVISAR_REGRA', () => {
    it('sem versão publicada vigente no mês de referência', () => {
      const signal = radar({}, { ruleVersion: null });

      expect(signal).toMatchObject({
        status: 'REVISAR_REGRA',
        priorityScore: 2000,
        evaluation: null,
      });
      expect(signal.reasons[0].message).toBe(
        'Nenhuma versão publicada da regra vale para 2026-09.',
      );
    });

    it('a última análise usou outra versão; o cálculo atual vai junto', () => {
      const signal = radar({}, { lastAnalysisRuleVersionId: 'versao-antiga' });

      expect(signal.status).toBe('REVISAR_REGRA');
      expect(codes(signal)).toEqual(['ANALYSIS_RULE_OUTDATED']);
      expect(signal.evaluation?.status).toBe('COMPLETED');
      expect(signal.ruleVersion).toEqual({
        id: FATOR_R_V1_VERSION.id,
        version: 1,
        evaluatorKey: 'SIMPLES_FATOR_R@1',
      });
    });

    it('a última análise com a versão vigente não é sinal', () => {
      expect(
        radar({}, { lastAnalysisRuleVersionId: FATOR_R_V1_VERSION.id }).status,
      ).toBe('NORMAL');
    });

    it('tem precedência sobre REQUER_ANALISE', () => {
      expect(
        radar(
          { revenue12m: '0.00' },
          { lastAnalysisRuleVersionId: 'versao-antiga' },
        ).status,
      ).toBe('REVISAR_REGRA');
    });
  });

  describe('3. REQUER_ANALISE', () => {
    it.each([
      [
        'RBT12 zero',
        { revenue12m: '0.00', payroll12m: '0.00' },
        'REVENUE_ZERO',
      ],
      [
        'RBT12 acima do limite',
        { revenue12m: '4800000.01', payroll12m: '1500000.00' },
        'REVENUE_ABOVE_LIMIT',
      ],
      [
        'folha maior que o RBT12',
        { payroll12m: '1000000.01' },
        'PAYROLL_EXCEEDS_REVENUE',
      ],
      [
        'mês de referência com 13 meses',
        { referencePeriod: '2025-09' },
        'REFERENCE_OUTDATED',
      ],
      [
        'mês de referência no futuro',
        { referencePeriod: '2026-11' },
        'REFERENCE_IN_FUTURE',
      ],
    ])('%s', (_case, data, code) => {
      const signal = radar(data);

      expect(signal.status).toBe('REQUER_ANALISE');
      expect(codes(signal)).toEqual([code]);
    });

    it('folha igual ao RBT12 não é inconsistente', () => {
      expect(codes(radar({ payroll12m: '1000000.00' }))).toEqual([
        'FATOR_R_OK',
      ]);
    });

    it('12 meses ainda não é desatualizado; o mês atual também não', () => {
      expect(radar({ referencePeriod: '2025-10' }).status).toBe('NORMAL');
      expect(radar({ referencePeriod: '2026-10' }).status).toBe('NORMAL');
    });

    it('conta os meses através da mudança de ano', () => {
      expect(
        radar({ referencePeriod: '2025-12' }, { currentPeriod: '2027-01' })
          .status,
      ).toBe('REQUER_ANALISE');
      expect(
        radar({ referencePeriod: '2026-01' }, { currentPeriod: '2027-01' })
          .status,
      ).toBe('NORMAL');
    });

    it('junta todos os motivos', () => {
      expect(
        codes(radar({ payroll12m: '2000000.00', referencePeriod: '2024-01' })),
      ).toEqual(['PAYROLL_EXCEEDS_REVENUE', 'REFERENCE_OUTDATED']);
    });

    it('explica a idade dos dados', () => {
      expect(radar({ referencePeriod: '2025-08' }).reasons[0].message).toBe(
        'Os dados são de 2025-08, há 14 meses; o máximo é 12.',
      );
    });
  });

  describe('4. OPORTUNIDADE_PARA_AVALIAR', () => {
    it('Fator R abaixo do limiar, a menos de 3 p.p.', () => {
      const signal = radar({ payroll12m: '260000.00' });

      expect(signal.status).toBe('OPORTUNIDADE_PARA_AVALIAR');
      expect(signal.reasons[0]).toEqual({
        code: 'NEAR_THRESHOLD_BELOW',
        message:
          'Fator R de 26,00%, a 2,00 p.p. do limiar de 28,00%: com mais folha, a empresa pode passar ao Anexo III.',
      });
    });

    it('Fator R acima do limiar, a menos de 3 p.p.', () => {
      const signal = radar({ payroll12m: '295000.00' });

      expect(signal.status).toBe('OPORTUNIDADE_PARA_AVALIAR');
      expect(codes(signal)).toEqual(['NEAR_THRESHOLD_ABOVE']);
    });

    it('exatamente no limiar', () => {
      expect(radar({ payroll12m: '280000.00' }).status).toBe(
        'OPORTUNIDADE_PARA_AVALIAR',
      );
    });

    it('a 3 p.p. ou mais já não é oportunidade', () => {
      expect(radar({ payroll12m: '250000.00' }).status).toBe('NORMAL');
      expect(radar({ payroll12m: '310000.00' }).status).toBe('NORMAL');
      expect(radar({ payroll12m: '250000.01' }).status).toBe(
        'OPORTUNIDADE_PARA_AVALIAR',
      );
    });
  });

  describe('5. NORMAL', () => {
    it('resume o resultado do cálculo', () => {
      const signal = radar();

      expect(signal.status).toBe('NORMAL');
      expect(signal.reasons).toEqual([
        {
          code: 'FATOR_R_OK',
          message: 'Fator R de 40,00%: Anexo III, alíquota efetiva de 12,44%.',
        },
      ]);
    });
  });

  describe('pontuação de prioridade (D30)', () => {
    it.each([
      ['no limiar', { payroll12m: '280000.00' }, 3999],
      ['a 2 p.p. do limiar', { payroll12m: '260000.00' }, 3979],
      ['NORMAL a 12 p.p.', {}, 879],
      ['REQUER_ANALISE sem Fator R', { revenue12m: '0.00' }, 4000],
      [
        'REQUER_ANALISE com Fator R longe do limiar',
        { payroll12m: '2500000.00' },
        4000,
      ],
      [
        'REQUER_ANALISE com Fator R',
        { referencePeriod: '2024-01', payroll12m: '300000.00' },
        4979,
      ],
    ])('%s', (_case, data, score) => {
      expect(radar(data).priorityScore).toBe(score);
    });

    it('um estado mais urgente vem sempre antes, seja qual for o desempate', () => {
      const scores = [
        radar({ referencePeriod: '2024-01', payroll12m: '0.00' }),
        radar({ payroll12m: '251000.00' }),
        radar({}, { lastAnalysisRuleVersionId: 'antiga' }),
        radar({ payroll12m: null }),
        radar({ payroll12m: '280000.00', taxRegime: 'LUCRO_REAL' }),
      ].map((signal) => [signal.status, signal.priorityScore] as const);

      expect(scores.map(([status]) => status)).toEqual([
        'REQUER_ANALISE',
        'OPORTUNIDADE_PARA_AVALIAR',
        'REVISAR_REGRA',
        'DADOS_INCOMPLETOS',
        'NORMAL',
      ]);
      const values = scores.map(([, score]) => score);
      expect([...values].sort((a, b) => b - a)).toEqual(values);
    });
  });

  it('é determinístico', () => {
    const input = { payroll12m: '271234.56' };

    expect(radar(input)).toStrictEqual(radar(input));
  });
});
