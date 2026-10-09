import { describe, expect, it } from 'vitest';
import { formatValidity } from './format';

describe('formatValidity', () => {
  it('sem fim', () => {
    expect(formatValidity('2018-01-01', null)).toBe('desde 01/01/2018, sem data de fim');
  });

  it('o fim é exclusivo: mostra o último dia em que vale', () => {
    expect(formatValidity('2018-01-01', '2027-01-01')).toBe('de 01/01/2018 a 31/12/2026');
  });
});
