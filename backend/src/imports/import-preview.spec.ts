import {
  classifyRows,
  type CurrentCompany,
  type PortfolioState,
  summarize,
} from './import-preview';
import type { ImportedValues } from './reading/normalize';
import type { ImportFileRow } from './reading/read-import-file';

const ALFA = '11222333000181';
const BETA = '12ABC34501DE35';
const NOVA = 'TRIBUX00000170';

function company(data: Partial<CurrentCompany> = {}): CurrentCompany {
  return {
    id: 'c-alfa',
    cnpj: ALFA,
    legalName: 'Alfa Ltda',
    tradeName: null,
    externalId: null,
    profile: {
      taxRegime: 'SIMPLES_NACIONAL',
      cnae: '6201501',
      city: 'São Paulo',
      state: 'SP',
      revenue12m: '1000000.00',
      payroll12m: '300000.00',
      referencePeriod: '2026-09',
      fatorRSubject: true,
    },
    ...data,
  };
}

function portfolio(companies: CurrentCompany[] = []): PortfolioState {
  return {
    byCnpj: new Map(companies.map((c) => [c.cnpj, c])),
    byExternalId: new Map(
      companies.flatMap((c) => (c.externalId ? [[c.externalId, c]] : [])),
    ),
  };
}

let line = 1;
function fileRow(
  values: Partial<ImportedValues> = {},
  errors: ImportFileRow['errors'] = [],
): ImportFileRow {
  line += 1;
  return {
    line,
    values: { cnpj: ALFA, legalName: 'Alfa Ltda', profile: {}, ...values },
    errors,
  };
}

beforeEach(() => {
  line = 1;
});

describe('classificação das linhas da importação (D36)', () => {
  it('guarda os valores de todas as linhas, para a confirmação reclassificar (D37)', () => {
    const errors = [{ column: 'uf' as const, message: 'x' }];
    const rows = classifyRows(
      [fileRow({ cnpj: NOVA }), fileRow(), fileRow({ cnpj: BETA }, errors)],
      portfolio([company()]),
    );

    expect(rows.map((r) => r.values.cnpj)).toEqual([NOVA, ALFA, BETA]);
  });

  it('empresa que não existe é nova, com os valores a aplicar', () => {
    const [row] = classifyRows([fileRow({ cnpj: NOVA })], portfolio());

    expect(row).toMatchObject({
      line: 2,
      outcome: 'NEW',
      cnpj: NOVA,
      companyId: null,
      values: { cnpj: NOVA, legalName: 'Alfa Ltda' },
    });
  });

  it('pelo CNPJ: igual é sem alterações; diferente é atualizada, com antes e depois', () => {
    // Uma classificação por linha: o mesmo CNPJ duas vezes seria conflito.
    const state = portfolio([company()]);
    const [same] = classifyRows([fileRow()], state);
    const [changed] = classifyRows(
      [
        fileRow({
          legalName: 'Alfa Nova Ltda',
          profile: { payroll12m: '350000.00', fatorRSubject: true },
        }),
      ],
      state,
    );

    expect(same).toMatchObject({
      outcome: 'UNCHANGED',
      companyId: 'c-alfa',
    });
    expect(changed).toMatchObject({ outcome: 'UPDATED', companyId: 'c-alfa' });
    expect(changed.changes).toEqual([
      { field: 'legalName', before: 'Alfa Ltda', after: 'Alfa Nova Ltda' },
      { field: 'payroll12m', before: '300000.00', after: '350000.00' },
    ]);
  });

  it('célula vazia não altera: só compara os campos preenchidos (D34)', () => {
    const [row] = classifyRows(
      [fileRow({ profile: { city: 'São Paulo' } })],
      portfolio([company()]),
    );

    expect(row.outcome).toBe('UNCHANGED');
  });

  it('empresa sem perfil: cada campo preenchido é uma mudança a partir de vazio', () => {
    const [row] = classifyRows(
      [fileRow({ profile: { state: 'RJ' } })],
      portfolio([company({ profile: null })]),
    );

    expect(row.changes).toEqual([
      { field: 'state', before: null, after: 'RJ' },
    ]);
  });

  it('o id externo novo de uma empresa existente é uma mudança', () => {
    const [row] = classifyRows(
      [fileRow({ externalId: 'E-1' })],
      portfolio([company()]),
    );

    expect(row).toMatchObject({
      outcome: 'UPDATED',
      changes: [{ field: 'externalId', before: null, after: 'E-1' }],
    });
  });

  it('o id externo aponta para uma empresa com outro CNPJ: conflito (o CNPJ nunca muda sozinho)', () => {
    const [row] = classifyRows(
      [fileRow({ externalId: 'E-1', cnpj: NOVA })],
      portfolio([company({ externalId: 'E-1' })]),
    );

    expect(row).toMatchObject({
      outcome: 'CONFLICT',
      reason: `O id externo E-1 é de "Alfa Ltda", que tem outro CNPJ (${ALFA}).`,
    });
  });

  it('o id externo de uma empresa e o CNPJ de outra são conflito', () => {
    const state = portfolio([
      company({ externalId: 'E-1' }),
      company({ id: 'c-beta', cnpj: BETA, legalName: 'Beta Ltda' }),
    ]);
    const [row] = classifyRows(
      [fileRow({ externalId: 'E-1', cnpj: BETA })],
      state,
    );

    expect(row).toMatchObject({
      outcome: 'CONFLICT',
      reason: 'O id externo E-1 é de "Alfa Ltda", mas o CNPJ é de "Beta Ltda".',
    });
  });

  it('o mesmo id externo e o mesmo CNPJ: reconhece a empresa', () => {
    const [row] = classifyRows(
      [fileRow({ externalId: 'E-1', legalName: 'Alfa S.A.' })],
      portfolio([company({ externalId: 'E-1' })]),
    );

    expect(row).toMatchObject({ outcome: 'UPDATED', companyId: 'c-alfa' });
    expect(row.changes.map((c) => c.field)).toEqual(['legalName']);
  });

  it('uma empresa que já tem outro id externo nesta origem é conflito', () => {
    const [row] = classifyRows(
      [fileRow({ externalId: 'E-2' })],
      portfolio([company({ externalId: 'E-1' })]),
    );

    expect(row).toMatchObject({
      outcome: 'CONFLICT',
      reason: '"Alfa Ltda" já tem o id externo E-1 nesta origem.',
    });
  });

  it('CNPJ ou id externo repetidos no ficheiro: todas as ocorrências são conflito', () => {
    const rows = classifyRows(
      [
        fileRow({ cnpj: NOVA }),
        fileRow({ cnpj: BETA, externalId: 'X' }),
        fileRow({ cnpj: NOVA }),
        fileRow({ cnpj: ALFA, externalId: 'X' }),
      ],
      portfolio(),
    );

    expect(rows.map((r) => r.outcome)).toEqual([
      'CONFLICT',
      'CONFLICT',
      'CONFLICT',
      'CONFLICT',
    ]);
    expect(rows[0].reason).toBe('CNPJ repetido no ficheiro (linhas 2, 4).');
    expect(rows[1].reason).toBe(
      'Id externo repetido no ficheiro (linhas 3, 5).',
    );
  });

  it('linhas com erros ficam como erro e não contam para as repetições', () => {
    const errors = [{ column: 'uf' as const, message: 'UF inválida.' }];
    const rows = classifyRows(
      [fileRow({ cnpj: NOVA }, errors), fileRow({ cnpj: NOVA })],
      portfolio(),
    );

    expect(rows[0]).toMatchObject({ outcome: 'ERROR', errors });
    expect(rows[1].outcome).toBe('NEW');
  });

  it('o resumo conta as linhas por resultado', () => {
    const rows = classifyRows(
      [
        fileRow({ cnpj: NOVA }),
        fileRow(),
        fileRow({ cnpj: BETA, legalName: 'Outra' }),
        fileRow({ cnpj: NOVA }, [{ column: 'uf', message: 'x' }]),
      ],
      portfolio([
        company(),
        company({ id: 'c-beta', cnpj: BETA, legalName: 'Beta Ltda' }),
      ]),
    );

    expect(summarize(rows)).toEqual({
      total: 4,
      new: 1,
      updated: 1,
      unchanged: 1,
      conflict: 0,
      error: 1,
    });
  });
});
