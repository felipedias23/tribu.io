import { cnpjCheckDigits, isValidCnpj, normalizeCnpj } from './cnpj';

describe('CNPJ', () => {
  it('remove a máscara e passa a maiúsculas', () => {
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
  });

  it.each([
    ['exemplo alfanumérico da Receita Federal', '12ABC34501DE35'],
    ['numérico', '11222333000181'],
    ['numérico com dígito verificador 0', '11444777000161'],
  ])('aceita CNPJ %s', (_case, cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '12ABC34501DE36'],
    ['dígitos verificadores com letra', '12ABC34501DEA5'],
    ['com máscara (não normalizado)', '12.ABC.345/01DE-35'],
    ['minúsculas (não normalizado)', '12abc34501de35'],
    ['curto', '1122233300018'],
    ['longo', '112223330001810'],
    ['sequência repetida', '00000000000000'],
    ['vazio', ''],
  ])('recusa CNPJ com %s', (_case, cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false);
  });

  it('calcula os dígitos verificadores da raiz', () => {
    expect(cnpjCheckDigits('12ABC34501DE')).toBe('35');
    expect(cnpjCheckDigits('112223330001')).toBe('81');
  });
});
