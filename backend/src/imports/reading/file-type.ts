import { ImportFileError } from './limits';

export type ImportFileFormat = 'CSV' | 'XLSX';

/** Assinatura de um ZIP (local file header): o XLSX é um ZIP. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, i) => bytes[i] === byte);
}

/**
 * Formato pela extensão, confirmado pelo conteúdo (S17): nunca pelo
 * Content-Type, que o browser declara. Um CSV é texto: não pode ser um ZIP nem
 * ter bytes nulos.
 */
export function detectFormat(
  fileName: string,
  bytes: Uint8Array,
): ImportFileFormat {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'xlsx') {
    if (!startsWith(bytes, ZIP_MAGIC)) {
      throw new ImportFileError('O conteúdo do ficheiro não é um XLSX válido.');
    }
    return 'XLSX';
  }
  if (extension === 'csv') {
    if (startsWith(bytes, ZIP_MAGIC) || bytes.includes(0)) {
      throw new ImportFileError(
        'O conteúdo do ficheiro não é um CSV de texto.',
      );
    }
    return 'CSV';
  }
  throw new ImportFileError('Envie um ficheiro .csv ou .xlsx.');
}
