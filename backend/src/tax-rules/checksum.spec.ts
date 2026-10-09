import { createHash } from 'node:crypto';
import { canonicalJson, parametersChecksum } from './checksum';

describe('checksum dos parâmetros', () => {
  it('ordena as chaves dos objetos, também nos aninhados', () => {
    expect(
      canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[3,{"e":2,"f":1}]},"b":1}');
  });

  it('mantém a ordem dos arrays (as faixas têm ordem)', () => {
    expect(canonicalJson([2, 1])).toBe('[2,1]');
  });

  it('escapa as chaves e os textos como JSON', () => {
    expect(canonicalJson({ 'a"b': 'x"y' })).toBe('{"a\\"b":"x\\"y"}');
  });

  it('dá o mesmo checksum para o mesmo conteúdo em ordens diferentes', () => {
    expect(parametersChecksum({ a: '1', b: { c: '2', d: '3' } })).toBe(
      parametersChecksum({ b: { d: '3', c: '2' }, a: '1' }),
    );
  });

  it('muda o checksum quando um valor muda', () => {
    expect(parametersChecksum({ threshold: '0.28' })).not.toBe(
      parametersChecksum({ threshold: '0.29' }),
    );
  });

  it('é o SHA-256 em hexadecimal do JSON canónico', () => {
    const expected = createHash('sha256')
      .update('{"a":"1","b":"2"}')
      .digest('hex');

    expect(parametersChecksum({ b: '2', a: '1' })).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });
});
