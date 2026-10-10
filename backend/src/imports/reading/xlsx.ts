import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { IMPORT_LIMITS, ImportFileError } from './limits';

/** Célula lida: texto, número (como texto) ou fórmula, que é recusada. */
export type XlsxCell =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'formula' }
  | { kind: 'error' };

export interface XlsxSheet {
  rows: (XlsxCell | null)[][];
  /** Sistema de datas 1904 (Excel antigo para Mac). */
  date1904: boolean;
}

const INVALID = 'O ficheiro XLSX está corrompido ou não é suportado.';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // Só elementos: o atributo `r` das células (r="A2") não é uma lista, mas o
  // elemento `<r>` (segmento de texto rico) é.
  isArray: (name, _path, _leaf, isAttribute) =>
    !isAttribute &&
    ['row', 'c', 'si', 'r', 'sheet', 'Relationship'].includes(name),
});

type Xml = Record<string, unknown>;

/** Valor de um atributo ou texto do XML; outra coisa (objeto, lista) vale ''. */
function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function parseXml(bytes: Uint8Array | undefined): Xml {
  if (!bytes) throw new ImportFileError(INVALID);
  const text = new TextDecoder().decode(bytes);
  // Sem DOCTYPE não há entidades definidas pelo ficheiro (expansão de entidades).
  if (/<!DOCTYPE/i.test(text)) throw new ImportFileError(INVALID);
  try {
    return parser.parse(text) as Xml;
  } catch {
    throw new ImportFileError(INVALID);
  }
}

/** Texto de um nó `<t>`, que pode vir com atributos (xml:space). */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node === null || typeof node !== 'object') return '';
  return scalar((node as Xml)['#text']);
}

/** Texto de um `<si>` ou `<is>`: simples (`<t>`) ou rico (vários `<r><t>`). */
function richText(node: Xml | undefined): string {
  if (!node) return '';
  if (node.t !== undefined) return textOf(node.t);
  return ((node.r as Xml[] | undefined) ?? [])
    .map((run) => textOf(run.t))
    .join('');
}

/** "AB12" → 27 (índice da coluna, a partir de 0). */
function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? '';
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/**
 * Unzip só das partes necessárias, depois de confirmar que a soma dos
 * tamanhos descompactados declarados cabe no limite (ZIP-bomb, D35). Se um
 * ZIP declarar menos do que contém, o fflate corta no tamanho declarado: a
 * memória fica limitada e o XML cortado é recusado.
 */
function unzipParts(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  let entries = 0;
  try {
    return unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        if (
          entries > IMPORT_LIMITS.maxXlsxEntries ||
          total > IMPORT_LIMITS.maxXlsxUncompressedBytes
        ) {
          throw new ImportFileError(
            'O ficheiro XLSX descompactado excede o tamanho permitido.',
          );
        }
        return (
          file.name === 'xl/workbook.xml' ||
          file.name === 'xl/_rels/workbook.xml.rels' ||
          file.name === 'xl/sharedStrings.xml' ||
          file.name.startsWith('xl/worksheets/')
        );
      },
    });
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw new ImportFileError(INVALID);
  }
}

/** Primeira folha do livro (D35), pela ordem do workbook.xml. */
function firstSheetPath(parts: Record<string, Uint8Array>): string {
  const workbook = parseXml(parts['xl/workbook.xml']).workbook as
    Xml | undefined;
  const sheets = ((workbook?.sheets as Xml | undefined)?.sheet as Xml[]) ?? [];
  const id = sheets[0]?.['r:id'];
  const rels = parseXml(parts['xl/_rels/workbook.xml.rels']).Relationships as
    Xml | undefined;
  const target = ((rels?.Relationship as Xml[]) ?? []).find(
    (r) => r.Id === id,
  )?.Target;
  if (typeof target !== 'string') throw new ImportFileError(INVALID);
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

/** Lê a primeira folha de um XLSX, sem avaliar nada. */
export function readXlsx(bytes: Uint8Array): XlsxSheet {
  const parts = unzipParts(bytes);
  const workbook = parseXml(parts['xl/workbook.xml']).workbook as
    Xml | undefined;
  const properties = workbook?.workbookPr as Xml | undefined;
  const date1904 = ['1', 'true'].includes(scalar(properties?.date1904));

  const shared = parts['xl/sharedStrings.xml']
    ? (
        ((parseXml(parts['xl/sharedStrings.xml']).sst as Xml | undefined)
          ?.si as Xml[]) ?? []
      ).map(richText)
    : [];

  const sheet = parseXml(parts[firstSheetPath(parts)]).worksheet as
    Xml | undefined;
  const rowNodes = ((sheet?.sheetData as Xml | undefined)?.row as Xml[]) ?? [];
  const rows: (XlsxCell | null)[][] = [];
  for (const rowNode of rowNodes) {
    const index = Number(rowNode.r) - 1;
    if (!Number.isInteger(index) || index < 0)
      throw new ImportFileError(INVALID);
    if (index >= IMPORT_LIMITS.maxXlsxRowReference) {
      throw new ImportFileError(
        `O ficheiro tem mais de ${IMPORT_LIMITS.maxRows} linhas de dados.`,
      );
    }
    const cells: (XlsxCell | null)[] = [];
    for (const cell of (rowNode.c as Xml[]) ?? []) {
      const column = columnIndex(scalar(cell.r));
      if (column < 0) throw new ImportFileError(INVALID);
      if (column >= IMPORT_LIMITS.maxXlsxColumns) {
        throw new ImportFileError('O ficheiro tem colunas a mais.');
      }
      cells[column] = readCell(cell, shared);
    }
    rows[index] = Array.from(cells, (c) => c ?? null);
  }
  return { rows: Array.from(rows, (r) => r ?? []), date1904 };
}

function readCell(cell: Xml, shared: string[]): XlsxCell | null {
  if (cell.f !== undefined) return { kind: 'formula' };
  const type = cell.t;
  if (type === 'e') return { kind: 'error' };
  if (type === 'inlineStr')
    return { kind: 'text', value: richText(cell.is as Xml) };
  const raw = textOf(cell.v);
  if (raw === '') return null;
  if (type === 's') {
    const value = shared[Number(raw)];
    if (value === undefined) throw new ImportFileError(INVALID);
    return { kind: 'text', value };
  }
  if (type === 'str') return { kind: 'text', value: raw };
  if (type === 'b') return { kind: 'text', value: raw === '1' ? 'sim' : 'não' };
  return { kind: 'number', value: raw };
}
