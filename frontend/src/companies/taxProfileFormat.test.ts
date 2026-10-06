import { describe, expect, it } from 'vitest';
import { formatCnae, formatMoney, formatPeriod, inputToMoney, moneyToInput } from './taxProfileFormat';

describe('formatação do perfil tributário', () => {
  it.each([
    ['6201501', '6201-5/01'],
    ['6201-5/01', '6201-5/01'],
    ['62015', '6201-5'],
    ['620', '620'],
    ['620150199', '6201-5/01'],
  ])('CNAE %s → %s', (input, expected) => {
    expect(formatCnae(input)).toBe(expected);
  });

  it.each([
    ['1.200.000,00', '1200000.00'],
    ['1200000,5', '1200000.5'],
    ['1200000.50', '1200000.50'],
    ['R$ 360.000,00', '360000.00'],
    ['0', '0'],
    ['  ', null],
  ])('valor escrito %s → %s', (input, expected) => {
    expect(inputToMoney(input)).toBe(expected);
  });

  it('mostra valores em reais e o mês por extenso', () => {
    expect(moneyToInput('1200000.00')).toBe('1.200.000,00');
    expect(moneyToInput(null)).toBe('');
    expect(formatMoney('0.00')).toMatch(/^R\$\s0,00$/);
    expect(formatPeriod('2026-09')).toBe('setembro de 2026');
  });
});
