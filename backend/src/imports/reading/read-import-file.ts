import {
  columnKey,
  IMPORT_COLUMNS,
  type ImportColumn,
  REQUIRED_COLUMNS,
} from './columns';
import { readCsv } from './csv';
import { detectFormat, type ImportFileFormat } from './file-type';
import { IMPORT_LIMITS, ImportFileError } from './limits';
import {
  type ImportedValues,
  type ImportRowError,
  normalizeRow,
  type RawCell,
} from './normalize';
import { readXlsx } from './xlsx';

export interface ImportFileRow {
  /** Número da linha no ficheiro (o cabeçalho é a linha 1). */
  line: number;
  values: ImportedValues;
  errors: ImportRowError[];
}

export interface ImportFileContent {
  format: ImportFileFormat;
  rows: ImportFileRow[];
  /** Colunas do ficheiro que não são do modelo: ignoradas e mostradas na prévia. */
  ignoredColumns: string[];
}

function isEmpty(cell: RawCell): boolean {
  return cell === null || (cell.kind === 'text' && cell.value.trim() === '');
}

function headerText(cell: RawCell): string {
  return cell && (cell.kind === 'text' || cell.kind === 'number')
    ? cell.value
    : '';
}

/**
 * Lê um ficheiro de importação (§3.6.1, D34, D35): limites, formato pelo
 * conteúdo, primeira folha, cabeçalho e linhas normalizadas. Função pura: o
 * mês atual vem de quem chama. Problemas do ficheiro inteiro lançam
 * ImportFileError; os de uma linha ficam na linha.
 */
export function readImportFile(input: {
  fileName: string;
  bytes: Uint8Array;
  currentPeriod: string;
}): ImportFileContent {
  if (input.bytes.length === 0) {
    throw new ImportFileError('O ficheiro está vazio.');
  }
  if (input.bytes.length > IMPORT_LIMITS.maxFileBytes) {
    throw new ImportFileError('O ficheiro excede o tamanho máximo de 2 MB.');
  }
  const format = detectFormat(input.fileName, input.bytes);

  let table: RawCell[][];
  let date1904 = false;
  if (format === 'CSV') {
    table = readCsv(input.bytes).map((row) =>
      row.map((value) => ({ kind: 'text', value }) as const),
    );
  } else {
    const sheet = readXlsx(input.bytes);
    table = sheet.rows;
    date1904 = sheet.date1904;
  }

  const [header = [], ...body] = table;
  const columns = new Map<number, ImportColumn>();
  const ignoredColumns: string[] = [];
  header.forEach((cell, index) => {
    const name = headerText(cell).trim();
    if (name === '') return;
    const key = columnKey(name);
    if (!(IMPORT_COLUMNS as readonly string[]).includes(key)) {
      ignoredColumns.push(name);
      return;
    }
    if ([...columns.values()].includes(key as ImportColumn)) {
      throw new ImportFileError(`A coluna "${name}" aparece mais de uma vez.`);
    }
    columns.set(index, key as ImportColumn);
  });
  const present = new Set(columns.values());
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    throw new ImportFileError(
      `Faltam as colunas obrigatórias: ${missing.join(', ')}. Use o ficheiro de exemplo.`,
    );
  }

  const rows: ImportFileRow[] = [];
  body.forEach((row, index) => {
    if (row.every(isEmpty)) return;
    if (rows.length >= IMPORT_LIMITS.maxRows) {
      throw new ImportFileError(
        `O ficheiro tem mais de ${IMPORT_LIMITS.maxRows} linhas de dados.`,
      );
    }
    const cells: Partial<Record<ImportColumn, RawCell>> = {};
    for (const [position, column] of columns)
      cells[column] = row[position] ?? null;
    rows.push({
      line: index + 2,
      ...normalizeRow(cells, { currentPeriod: input.currentPeriod, date1904 }),
    });
  });
  if (rows.length === 0) {
    throw new ImportFileError('O ficheiro não tem linhas de dados.');
  }
  return { format, rows, ignoredColumns };
}
