/** Limites da importação (D35). */
export const IMPORT_LIMITS = {
  /** Tamanho máximo do ficheiro enviado. */
  maxFileBytes: 2 * 1024 * 1024,
  /** Linhas de dados, sem contar o cabeçalho nem as linhas vazias. */
  maxRows: 2000,
  /** Soma dos tamanhos descompactados de um XLSX (um XLSX é um ZIP). */
  maxXlsxUncompressedBytes: 20 * 1024 * 1024,
  /** Entradas no ZIP de um XLSX. */
  maxXlsxEntries: 1000,
  /**
   * Maior referência de linha e de coluna aceite num XLSX: um ficheiro
   * legítimo fica muito abaixo, e uma referência como A1000000 obrigaria a
   * criar estruturas enormes em memória.
   */
  maxXlsxRowReference: 10_000,
  maxXlsxColumns: 200,
} as const;

/**
 * Erro no ficheiro inteiro (formato, tamanho, cabeçalho): a importação não
 * avança. Erros de uma linha não lançam: ficam na própria linha.
 */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}
