import type { RadarStatus } from './api';

export const STATUS_LABELS: Record<RadarStatus, string> = {
  DADOS_INCOMPLETOS: 'Dados incompletos',
  REVISAR_REGRA: 'Revisar regra',
  REQUER_ANALISE: 'Requer análise',
  OPORTUNIDADE_PARA_AVALIAR: 'Oportunidade para avaliar',
  NORMAL: 'Normal',
};

/**
 * Fração decimal em texto ("0.2604") para percentagem com 2 casas, truncada
 * ("26,04%"). Trabalha sobre o texto, sem vírgula flutuante: em JavaScript,
 * 0.57 × 100 dá 56,99999…. Truncar, como no backend, faz com que um Fator R
 * abaixo do limiar nunca apareça igual a ele.
 */
export function fractionToPercent(fraction: string): string {
  const [integer, decimals = ''] = fraction.split('.');
  const digits = decimals.padEnd(4, '0');
  const whole = (BigInt(integer) * 100n + BigInt(digits.slice(0, 2))).toString();
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${digits.slice(2, 4)}%`;
}
