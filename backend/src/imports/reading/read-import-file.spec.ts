import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { readImportFile } from './read-import-file';
import { buildXlsx, type FixtureCell } from './xlsx.fixture';

const CURRENT = '2026-10';
const FIXTURES = join(__dirname, '../../../test/fixtures/imports');
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(FIXTURES, name)));

const HEADER = ['cnpj', 'razao_social'];
const read = (fileName: string, bytes: Uint8Array) =>
  readImportFile({ fileName, bytes, currentPeriod: CURRENT });
const csv = (text: string) => read('carteira.csv', strToU8(text));
const xlsx = (rows: FixtureCell[][], options = {}) =>
  read('carteira.xlsx', buildXlsx(rows, options));
const fileError = (fn: () => unknown, message: RegExp | string) =>
  expect(fn).toThrow(
    expect.objectContaining({
      name: 'ImportFileError',
      message: expect.stringMatching(message) as string,
    }) as Error,
  );

/** Primeira linha de dados de um CSV com o cabeçalho completo do modelo. */
function firstRow(cells: Record<string, string>) {
  const columns = ['cnpj', 'razao_social', ...Object.keys(cells)];
  const values = ['11222333000181', 'Empresa Ltda', ...Object.values(cells)];
  return csv(`${columns.join(';')}\n${values.join(';')}`).rows[0];
}

describe('leitura do ficheiro de importação (D34, D35)', () => {
  describe('XLSX gravado pelo LibreOffice em pt-BR', () => {
    const content = read('carteira.xlsx', fixture('carteira-libreoffice.xlsx'));

    it('lê as linhas de dados, sem a linha vazia, com o número da linha', () => {
      expect(content.format).toBe('XLSX');
      expect(content.rows.map((r) => r.line)).toEqual([2, 3, 4, 6]);
      expect(content.ignoredColumns).toEqual(['Observações']);
    });

    it('recupera os zeros que o Excel apaga e converte números e datas', () => {
      expect(content.rows[0]).toEqual({
        line: 2,
        errors: [],
        values: {
          cnpj: '01234567000195',
          legalName: 'Consultoria Zero à Esquerda Ltda',
          tradeName: 'Zero',
          externalId: 'E-001',
          profile: {
            taxRegime: 'SIMPLES_NACIONAL',
            cnae: '6201501',
            city: 'São Paulo',
            state: 'SP',
            revenue12m: '1200000.00',
            payroll12m: '336000.00',
            referencePeriod: '2026-09',
            fatorRSubject: true,
          },
        },
      });
      expect(content.rows[1].values).toMatchObject({
        cnpj: 'TRIBUX00000170',
        profile: { cnae: '0111301', state: 'SP', fatorRSubject: false },
      });
    });

    it('células vazias ficam ausentes, não vazias nem zero', () => {
      expect(content.rows[1].values.tradeName).toBeUndefined();
      expect(content.rows[1].values.profile).not.toHaveProperty('payroll12m');
      expect(content.rows[1].values.profile).not.toHaveProperty(
        'referencePeriod',
      );
    });

    it('recusa a fórmula sem a avaliar; o resto da linha é lido', () => {
      expect(content.rows[2].errors).toEqual([
        {
          column: 'receita_12m',
          message: 'Célula com fórmula: exporte os valores, não as fórmulas.',
        },
      ]);
      expect(content.rows[2].values.profile).not.toHaveProperty('revenue12m');
      expect(content.rows[2].values.profile.payroll12m).toBe('100000.00');
    });

    it('junta os erros por coluna, com a mensagem de cada um', () => {
      expect(content.rows[3].values.cnpj).toBe('11222333000181');
      expect(content.rows[3].errors.map((e) => e.column)).toEqual([
        'regime',
        'receita_12m',
        'mes_referencia',
        'sujeita_fator_r',
      ]);
    });
  });

  describe('CSV exportado em português', () => {
    it('UTF-8 e Windows-1252 dão o mesmo resultado, com acentos certos', () => {
      const utf8 = read('carteira.csv', fixture('carteira-utf8.csv'));
      const windows = read(
        'carteira.csv',
        fixture('carteira-windows-1252.csv'),
      );

      expect(windows).toEqual(utf8);
      expect(utf8.rows[0].values.legalName).toBe(
        'Consultoria Zero à Esquerda Ltda',
      );
      expect(utf8.ignoredColumns).toEqual(['Observações']);
    });

    it('lê os formatos de texto do Excel em português', () => {
      const { rows } = read('carteira.csv', fixture('carteira-utf8.csv'));

      expect(rows[0].values.profile).toMatchObject({
        revenue12m: '1200000.00',
        payroll12m: '336000.00',
        referencePeriod: '2026-09',
      });
      expect(rows[2].errors[0].column).toBe('receita_12m');
    });

    it('aceita o separador vírgula e o BOM do UTF-8', () => {
      const { rows } = csv(
        '﻿cnpj,razao_social,uf\n11222333000181,"Vírgula, Ltda",rj',
      );

      expect(rows[0].values).toMatchObject({
        cnpj: '11222333000181',
        legalName: 'Vírgula, Ltda',
        profile: { state: 'RJ' },
      });
    });
  });

  describe('formato e limites do ficheiro (S17, D35)', () => {
    it.each([
      [
        'XLSX que é texto',
        'carteira.xlsx',
        strToU8('cnpj;razao_social\n11222333000181;X'),
        'não é um XLSX válido',
      ],
      [
        'CSV que é um ZIP',
        'carteira.csv',
        buildXlsx([HEADER]),
        'não é um CSV de texto',
      ],
      [
        'CSV com bytes nulos',
        'carteira.csv',
        strToU8('cnpj;razao_social\n11222333000181;X\0'),
        'não é um CSV de texto',
      ],
      ['outra extensão', 'carteira.ods', strToU8('cnpj'), '.csv ou .xlsx'],
    ])(
      'recusa %s, pelo conteúdo e não só pela extensão',
      (_case, name, bytes, message) => {
        fileError(() => read(name, bytes), message);
      },
    );

    it('recusa um ficheiro vazio ou com mais de 2 MB', () => {
      fileError(() => csv(''), 'vazio');
      fileError(
        () =>
          read('carteira.csv', new Uint8Array(2 * 1024 * 1024 + 1).fill(65)),
        '2 MB',
      );
    });

    it('aceita 2.000 linhas de dados e recusa 2.001', () => {
      const lines = (n: number) =>
        Array.from({ length: n }, (_, i) => `11222333000181;Empresa ${i}`);

      expect(
        csv([HEADER.join(';'), ...lines(2000)].join('\n')).rows,
      ).toHaveLength(2000);
      fileError(
        () => csv([HEADER.join(';'), ...lines(2001)].join('\n')),
        'mais de 2000 linhas',
      );
    });

    it('um CSV com aspas por fechar é um erro do ficheiro, com a linha', () => {
      fileError(
        () => csv('cnpj;razao_social\n11222333000181;"Aberta Ltda\n'),
        /mal formado perto da linha \d+/,
      );
    });

    it('exige as colunas obrigatórias e recusa colunas repetidas', () => {
      fileError(() => csv('cnpj;nome\n1;2'), 'razao_social');
      fileError(
        () => csv('cnpj;Razão Social;razao_social\n1;2;3'),
        'mais de uma vez',
      );
      fileError(() => csv(HEADER.join(';')), 'não tem linhas de dados');
    });

    it('reconhece o cabeçalho sem distinguir maiúsculas, acentos nem espaços', () => {
      const { rows } = csv(
        ' CNPJ ;Razão  Social;Mês-Referência\n11222333000181;X;2026-01',
      );

      expect(rows[0].values.profile.referencePeriod).toBe('2026-01');
    });
  });

  describe('XLSX malicioso ou invulgar', () => {
    it('recusa uma ZIP-bomb antes de descompactar (25 MB de zeros)', () => {
      const bomb = zipSync(
        {
          'xl/workbook.xml': strToU8('<workbook/>'),
          'xl/worksheets/sheet1.xml': new Uint8Array(25 * 1024 * 1024),
        },
        { level: 9 },
      );
      expect(bomb.length).toBeLessThan(2 * 1024 * 1024);

      fileError(() => read('carteira.xlsx', bomb), 'descompactado excede');
    });

    it('um ZIP que mente sobre o tamanho fica cortado e é recusado', () => {
      const zip = buildXlsx([HEADER, ['11222333000181', 'Empresa']]);
      const view = new DataView(zip.buffer);
      for (let i = 0; i < zip.length - 4; i += 1) {
        const signature = view.getUint32(i, true);
        if (signature === 0x04034b50) view.setUint32(i + 22, 10, true);
        if (signature === 0x02014b50) view.setUint32(i + 24, 10, true);
      }

      fileError(() => read('carteira.xlsx', zip), 'corrompido');
    });

    it('recusa XML com DOCTYPE (expansão de entidades)', () => {
      fileError(() => xlsx([HEADER], { doctype: true }), 'corrompido');
    });

    it('recusa referências de linha ou coluna desproporcionadas', () => {
      fileError(
        () => xlsx([HEADER], { firstRow: 10_001 }),
        'mais de 2000 linhas',
      );
      const wide: FixtureCell[] = Array.from({ length: 201 }, () => null);
      wide[200] = 'x';
      fileError(() => xlsx([HEADER, wide]), 'colunas a mais');
    });

    it('lê a primeira folha do livro, não a primeira do ZIP', () => {
      const { rows } = xlsx([HEADER, ['11222333000181', 'Certa Ltda']], {
        sheetFile: 'sheet9.xml',
        decoySheet: true,
      });

      expect(rows[0].values.legalName).toBe('Certa Ltda');
    });

    it('lê texto rico, texto inline, booleanos e o sistema de datas 1904', () => {
      const { rows } = xlsx(
        [
          [...HEADER, 'nome_fantasia', 'sujeita_fator_r', 'mes_referencia'],
          [
            { inline: '11222333000181' },
            { rich: ['Rica ', 'Ltda'] },
            { inline: 'Inline' },
            { bool: true },
            44804,
          ],
        ],
        { date1904: true },
      );

      expect(rows[0].values).toMatchObject({
        legalName: 'Rica Ltda',
        tradeName: 'Inline',
        profile: { fatorRSubject: true, referencePeriod: '2026-09' },
      });
    });

    it('células com erro ou fórmula ficam como erro da coluna', () => {
      const { rows } = xlsx([
        [...HEADER, 'uf', 'cnae'],
        [
          '11222333000181',
          'X',
          { error: true },
          { formula: 'A1', cached: 'SP' },
        ],
      ]);

      // Pela ordem das colunas do modelo (§3.6.1), não do ficheiro.
      expect(rows[0].errors).toEqual([
        {
          column: 'cnae',
          message: 'Célula com fórmula: exporte os valores, não as fórmulas.',
        },
        { column: 'uf', message: 'Célula com erro do Excel.' },
      ]);
    });
  });

  describe('valores de cada coluna (as regras da API)', () => {
    it.each([
      ['1.200.000,00', '1200000.00'],
      ['1200000,5', '1200000.50'],
      ['1.200.000', '1200000.00'],
      ['R$ 1.200,00', '1200.00'],
      ['0', '0.00'],
    ])('receita %s → %s', (cell, value) => {
      expect(firstRow({ receita_12m: cell }).values.profile.revenue12m).toBe(
        value,
      );
    });

    it.each(['-10', '1,234.56', '12,345', 'abc', '99999999999999'])(
      'recusa a receita %s',
      (cell) => {
        expect(firstRow({ receita_12m: cell }).errors[0].column).toBe(
          'receita_12m',
        );
      },
    );

    it.each([
      ['2026-09', '2026-09'],
      ['09/2026', '2026-09'],
      ['9/2026', '2026-09'],
      ['30/09/2026', '2026-09'],
    ])('mês %s → %s', (cell, value) => {
      expect(
        firstRow({ mes_referencia: cell }).values.profile.referencePeriod,
      ).toBe(value);
    });

    it('aceita o mês atual', () => {
      expect(
        firstRow({ mes_referencia: CURRENT }).values.profile.referencePeriod,
      ).toBe(CURRENT);
    });

    it.each([
      ['2026-11', 'futuro'],
      ['1899-12', 'entre 1900 e 2099'],
      ['13/2026', 'entre 1900 e 2099'],
    ])('recusa o mês %s', (cell, message) => {
      expect(firstRow({ mes_referencia: cell }).errors[0].message).toMatch(
        message,
      );
    });

    it.each([
      ['Simples Nacional', 'SIMPLES_NACIONAL'],
      ['LUCRO PRESUMIDO', 'LUCRO_PRESUMIDO'],
      ['lucro_real', 'LUCRO_REAL'],
    ])('regime %s → %s', (cell, value) => {
      expect(firstRow({ regime: cell }).values.profile.taxRegime).toBe(value);
    });

    it.each([
      ['Sim', true],
      ['NÃO', false],
      ['nao', false],
      ['S', true],
      ['false', false],
    ])('sujeita ao Fator R %s → %s', (cell, value) => {
      expect(
        firstRow({ sujeita_fator_r: cell }).values.profile.fatorRSubject,
      ).toBe(value);
    });

    it('CNPJ: com máscara, alfanumérico em minúsculas, inválido ou ausente', () => {
      expect(firstRow({}).values.cnpj).toBe('11222333000181');
      expect(
        csv('cnpj;razao_social\n12.abc.345/01de-35;X').rows[0].values.cnpj,
      ).toBe('12ABC34501DE35');
      expect(csv('cnpj;razao_social\n11222333000180;X').rows[0].errors).toEqual(
        [{ column: 'cnpj', message: 'Informe um CNPJ válido.' }],
      );
      expect(csv('cnpj;razao_social\n;X').rows[0].errors).toEqual([
        { column: 'cnpj', message: 'Obrigatório.' },
      ]);
    });

    it('recusa textos longos, UF e CNAE inválidos e "=" no CSV', () => {
      const row = firstRow({
        nome_fantasia: 'x'.repeat(151),
        uf: 'XX',
        cnae: '12345',
        municipio: '=HYPERLINK("http://mal")',
      });

      expect(row.errors.map((e) => e.column)).toEqual([
        'nome_fantasia',
        'cnae',
        'municipio',
        'uf',
      ]);
    });
  });
});
