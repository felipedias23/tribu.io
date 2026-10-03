import { Transform } from 'class-transformer';
import { registerDecorator } from 'class-validator';
import { isValidCnpj, normalizeCnpj } from '../cnpj';

export const NAME_MAX_LENGTH = 150;

/** Aceita o CNPJ com ou sem máscara e guarda-o normalizado. */
export const NormalizeCnpj = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeCnpj(value) : value,
  );

/** Remove espaços nas pontas; texto vazio passa a null (campo opcional). */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export function IsCnpj() {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCnpj',
      target: object.constructor,
      propertyName,
      options: { message: 'Informe um CNPJ válido.' },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidCnpj(value),
      },
    });
}
