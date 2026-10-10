import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import { ImportFileError } from './limits';

/**
 * Texto do CSV: UTF-8 (com ou sem BOM) ou, se não for UTF-8 válido,
 * Windows-1252, a codificação do Excel em português.
 */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return iconv.decode(Buffer.from(bytes), 'win1252');
  }
}

/** Separador pelo cabeçalho: `;` (Excel em português) ou `,`. */
export function detectDelimiter(text: string): ';' | ',' {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (char: string) => header.split(char).length - 1;
  return count(';') >= count(',') && count(';') > 0 ? ';' : ',';
}

/**
 * Linhas do CSV como texto, sem interpretar valores. Aspas a meio de um campo
 * são aceites, como no Excel; um CSV que mesmo assim não se consegue ler é um
 * erro do ficheiro, com a linha.
 */
export function readCsv(bytes: Uint8Array): string[][] {
  const text = decodeCsv(bytes);
  try {
    return parse(text, {
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      bom: true,
    });
  } catch (error) {
    const line = (error as { lines?: number }).lines;
    throw new ImportFileError(
      `O CSV está mal formado${line ? ` perto da linha ${line}` : ''}: verifique as aspas.`,
    );
  }
}
