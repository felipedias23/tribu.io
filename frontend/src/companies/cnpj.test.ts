import { describe, expect, it } from 'vitest';
import { formatCnpj } from './cnpj';

describe('formatCnpj', () => {
  it.each([
    ['12ABC34501DE35', '12.ABC.345/01DE-35'],
    ['12abc34501de35', '12.ABC.345/01DE-35'],
    ['11222333000181', '11.222.333/0001-81'],
    ['11.222.333/0001-81', '11.222.333/0001-81'],
    ['11222', '11.222'],
    ['112223330', '11.222.333/0'],
    ['1122233300018199', '11.222.333/0001-81'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(formatCnpj(input)).toBe(expected);
  });
});
