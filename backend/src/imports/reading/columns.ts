/** Colunas do modelo do ficheiro (§3.6.1, D34). */
export const IMPORT_COLUMNS = [
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'id_externo',
  'regime',
  'cnae',
  'municipio',
  'uf',
  'receita_12m',
  'folha_12m',
  'mes_referencia',
  'sujeita_fator_r',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'cnpj',
  'razao_social',
];

/** "Razão Social " → "razao_social": sem acentos, minúsculas, `_` nos espaços. */
export function columnKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}
