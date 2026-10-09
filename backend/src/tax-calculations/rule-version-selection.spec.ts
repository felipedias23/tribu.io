import { selectVersion, type VersionValidity } from './rule-version-selection';

function version(
  name: string,
  validFrom: string,
  validUntil: string | null,
  status: VersionValidity['status'] = 'PUBLISHED',
) {
  return {
    name,
    status,
    validFrom: new Date(validFrom),
    validUntil: validUntil === null ? null : new Date(validUntil),
  };
}

describe('seleção da versão vigente (§3.4)', () => {
  const v1 = version('v1', '2018-01-01', '2027-01-01');
  const v2 = version('v2', '2027-01-01', null);

  it.each([
    ['antes da primeira vigência', '2017-12', null],
    ['no primeiro mês da v1', '2018-01', 'v1'],
    ['no último mês da v1', '2026-12', 'v1'],
    ['no primeiro dia da v2 (fim da v1 é exclusivo)', '2027-01', 'v2'],
    ['muito depois, com a v2 sem fim', '2099-12', 'v2'],
  ])('%s', (_case, period, expected) => {
    expect(selectVersion([v1, v2], period)?.name ?? null).toBe(expected);
  });

  it('ignora rascunhos e versões substituídas', () => {
    const versions = [
      version('rascunho', '2018-01-01', null, 'DRAFT'),
      version('antiga', '2018-01-01', null, 'SUPERSEDED'),
    ];

    expect(selectVersion(versions, '2026-09')).toBeNull();
    expect(
      selectVersion(
        [...versions, version('atual', '2018-01-01', null)],
        '2026-09',
      )?.name,
    ).toBe('atual');
  });

  it('sem versões, não há vigente', () => {
    expect(selectVersion([], '2026-09')).toBeNull();
  });
});
