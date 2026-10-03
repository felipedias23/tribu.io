/**
 * CNPJ numérico e alfanumérico (IN RFB 2.229/2024): 12 caracteres [0-9A-Z]
 * seguidos de 2 dígitos verificadores. No cálculo, cada caractere vale o seu
 * código ASCII menos 48, o que mantém o resultado dos CNPJs só numéricos.
 */
const CNPJ_FORMAT = /^[0-9A-Z]{12}[0-9]{2}$/;
const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_WEIGHTS = [6, ...FIRST_WEIGHTS];

/** Remove a máscara (pontos, barra, hífen e espaços) e passa a maiúsculas. */
export function normalizeCnpj(value: string): string {
  return value.replace(/[.\-/\s]/g, '').toUpperCase();
}

function checkDigit(base: string, weights: number[]): number {
  const sum = weights.reduce(
    (total, weight, index) => total + (base.charCodeAt(index) - 48) * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Dígitos verificadores dos 12 primeiros caracteres (já normalizados). */
export function cnpjCheckDigits(base: string): string {
  const first = checkDigit(base, FIRST_WEIGHTS);
  const second = checkDigit(`${base}${first}`, SECOND_WEIGHTS);
  return `${first}${second}`;
}

/** Valida um CNPJ já normalizado (ver `normalizeCnpj`). */
export function isValidCnpj(cnpj: string): boolean {
  if (!CNPJ_FORMAT.test(cnpj)) return false;
  // Sequências repetidas (00000000000000, 11111111111111…) passam no cálculo
  // mas não são CNPJs atribuídos.
  if (/^(.)\1+$/.test(cnpj)) return false;
  return cnpj.slice(12) === cnpjCheckDigits(cnpj.slice(0, 12));
}
