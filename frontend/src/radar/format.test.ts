import { describe, expect, it } from 'vitest';
import { fractionToPercent } from './format';

describe('fractionToPercent', () => {
  it.each([
    ['0.28', '28,00%'],
    ['0.2604', '26,04%'],
    ['0.1303', '13,03%'],
    ['0.4', '40,00%'],
    ['0', '0,00%'],
    ['1', '100,00%'],
  ])('%s → %s', (fraction, percent) => {
    expect(fractionToPercent(fraction)).toBe(percent);
  });

  it('não usa vírgula flutuante: 0,57 não vira 56,99%', () => {
    expect(Math.floor(0.57 * 10000) / 100).toBe(56.99);
    expect(fractionToPercent('0.57')).toBe('57,00%');
  });

  it('trunca, como o backend: um valor abaixo do limiar não aparece igual a ele', () => {
    expect(fractionToPercent('0.27999999')).toBe('27,99%');
    expect(fractionToPercent('0.2604166666666666666666666666666666666667')).toBe('26,04%');
  });

  it('agrupa os milhares de um Fator R muito alto', () => {
    expect(fractionToPercent('12.3456')).toBe('1.234,56%');
  });
});
