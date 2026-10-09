import {
  type FatorRParameters,
  fatorRParametersSchema,
} from './simples-fator-r.parameters';

function brackets(rates: string[]) {
  const limits = ['180000.00', '360000.00', '4800000.00'];
  return limits.map((upTo, index) => ({
    upTo,
    nominalRate: rates[index],
    deduction: '0.00',
  }));
}

function valid(): FatorRParameters {
  return {
    threshold: '0.28',
    opportunityMargin: '0.03',
    maxReferenceAgeMonths: 12,
    revenueLimit: '4800000.00',
    annexes: {
      III: brackets(['0.06', '0.112', '0.33']),
      V: brackets(['0.155', '0.18', '0.305']),
    },
  };
}

function issues(parameters: unknown): string[] {
  const result = fatorRParametersSchema.safeParse(parameters);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('parâmetros do SIMPLES_FATOR_R@1', () => {
  it('aceita parâmetros válidos', () => {
    expect(issues(valid())).toEqual([]);
  });

  it('recusa valores em número, que perderiam precisão', () => {
    expect(issues({ ...valid(), threshold: 0.28 })).toEqual(['threshold']);
  });

  it('recusa decimais negativos ou mal escritos', () => {
    expect(issues({ ...valid(), revenueLimit: '-1' })).toContain(
      'revenueLimit',
    );
    expect(issues({ ...valid(), threshold: '0,28' })).toEqual(['threshold']);
  });

  it('recusa campos desconhecidos', () => {
    expect(issues({ ...valid(), extra: '1' })).toEqual(['']);
  });

  it('exige limiar e margem entre 0 e 1, sem os extremos', () => {
    expect(issues({ ...valid(), threshold: '1' })).toEqual(['threshold']);
    expect(issues({ ...valid(), opportunityMargin: '0' })).toEqual([
      'opportunityMargin',
    ]);
    expect(issues({ ...valid(), threshold: '0.99' })).toEqual([]);
  });

  it('exige alíquotas nominais entre 0 e 1', () => {
    const parameters = valid();
    parameters.annexes.V[1].nominalRate = '18';

    expect(issues(parameters)).toEqual(['annexes.V.1.nominalRate']);
  });

  it('exige faixas por ordem crescente', () => {
    const parameters = valid();
    parameters.annexes.III[1].upTo = '180000.00';

    expect(issues(parameters)).toEqual(['annexes.III.1.upTo']);
  });

  it('exige que a última faixa termine no limite do regime', () => {
    const parameters = valid();
    parameters.annexes.V[2].upTo = '3600000.00';

    expect(issues(parameters)).toEqual(['annexes.V']);
  });

  it('exige os dois anexos, cada um com pelo menos uma faixa', () => {
    expect(
      issues({ ...valid(), annexes: { III: valid().annexes.III, V: [] } }),
    ).toContain('annexes.V');
    expect(
      issues({ ...valid(), annexes: { III: valid().annexes.III } }),
    ).toContain('annexes.V');
  });

  it('exige uma idade máxima do período inteira e positiva', () => {
    expect(issues({ ...valid(), maxReferenceAgeMonths: 0 })).toEqual([
      'maxReferenceAgeMonths',
    ]);
    expect(issues({ ...valid(), maxReferenceAgeMonths: 1.5 })).toEqual([
      'maxReferenceAgeMonths',
    ]);
  });
});
