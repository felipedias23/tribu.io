/**
 * Máscara do CNPJ numérico ou alfanumérico (XX.XXX.XXX/XXXX-XX), aplicada à
 * medida que se escreve. A validação dos dígitos verificadores é do backend.
 */
export function formatCnpj(value: string): string {
  const raw = value
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .slice(0, 14);
  const separators: [number, string][] = [
    [2, '.'],
    [5, '.'],
    [8, '/'],
    [12, '-'],
  ];
  let formatted = '';
  for (const [index, char] of [...raw].entries()) {
    const separator = separators.find(([position]) => position === index);
    formatted += (separator ? separator[1] : '') + char;
  }
  return formatted;
}
