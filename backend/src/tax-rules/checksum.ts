import { createHash } from 'node:crypto';

/**
 * JSON canónico: chaves dos objetos por ordem alfabética, sem espaços. O mesmo
 * conteúdo dá sempre o mesmo texto, seja qual for a ordem em que foi escrito.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 (hex) do JSON canónico: o checksum dos parâmetros de uma versão (§3.4). */
export function parametersChecksum(parameters: unknown): string {
  return createHash('sha256').update(canonicalJson(parameters)).digest('hex');
}
