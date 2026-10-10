import { strToU8, zipSync } from 'fflate';

/** Célula de um XLSX de teste. */
export type FixtureCell =
  | string
  | number
  | null
  | { formula: string; cached?: string }
  | { inline: string }
  | { rich: string[] }
  | { bool: boolean }
  | { error: true };

export interface FixtureOptions {
  date1904?: boolean;
  /** Linha da primeira linha de `rows` (1 = normal). */
  firstRow?: number;
  /** Nome do ficheiro da folha, para testar que se segue o workbook.xml. */
  sheetFile?: string;
  /** Acrescenta uma segunda folha antes no ZIP, que não é a primeira do livro. */
  decoySheet?: boolean;
  doctype?: boolean;
}

function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** XLSX mínimo, com as partes que o leitor usa, para os testes unitários. */
export function buildXlsx(
  rows: FixtureCell[][],
  options: FixtureOptions = {},
): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (xml: string) => {
    shared.push(xml);
    return shared.length - 1;
  };
  const first = options.firstRow ?? 1;
  const sheetRows = rows
    .map((row, r) => {
      const ref = r + first;
      const cells = row
        .map((cell, c) => {
          const at = `${column(c)}${ref}`;
          if (cell === null) return '';
          if (typeof cell === 'number')
            return `<c r="${at}"><v>${cell}</v></c>`;
          if (typeof cell === 'string') {
            const i = sharedIndex(`<si><t>${escape(cell)}</t></si>`);
            return `<c r="${at}" t="s"><v>${i}</v></c>`;
          }
          if ('formula' in cell) {
            return `<c r="${at}"><f>${escape(cell.formula)}</f><v>${cell.cached ?? '0'}</v></c>`;
          }
          if ('inline' in cell) {
            return `<c r="${at}" t="inlineStr"><is><t>${escape(cell.inline)}</t></is></c>`;
          }
          if ('rich' in cell) {
            const runs = cell.rich.map(
              (t) => `<r><t xml:space="preserve">${escape(t)}</t></r>`,
            );
            const i = sharedIndex(`<si>${runs.join('')}</si>`);
            return `<c r="${at}" t="s"><v>${i}</v></c>`;
          }
          if ('bool' in cell) {
            return `<c r="${at}" t="b"><v>${cell.bool ? 1 : 0}</v></c>`;
          }
          return `<c r="${at}" t="e"><v>#N/A</v></c>`;
        })
        .join('');
      return `<row r="${ref}">${cells}</row>`;
    })
    .join('');

  const doctype = options.doctype
    ? '<!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]>'
    : '';
  const sheetFile = options.sheetFile ?? 'sheet1.xml';
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><workbook xmlns:r="r">${options.date1904 ? '<workbookPr date1904="1"/>' : ''}<sheets><sheet name="Carteira" sheetId="1" r:id="rId1"/><sheet name="Outra" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId2" Target="worksheets/decoy.xml"/><Relationship Id="rId1" Target="worksheets/${sheetFile}"/></Relationships>`,
    ),
    'xl/sharedStrings.xml': strToU8(
      `<?xml version="1.0"?><sst>${shared.join('')}</sst>`,
    ),
    [`xl/worksheets/${sheetFile}`]: strToU8(
      `<?xml version="1.0"?>${doctype}<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  if (options.decoySheet) {
    files['xl/worksheets/decoy.xml'] = strToU8(
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>errada</t></is></c></row></sheetData></worksheet>',
    );
  }
  return zipSync(files);
}
