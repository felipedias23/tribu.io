import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  flattenValidationErrors,
  validationExceptionFactory,
} from './validation-exception.factory';

function error(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('validationExceptionFactory', () => {
  it('lista as mensagens de cada campo inválido', () => {
    const details = flattenValidationErrors([
      error('email', { isEmail: 'email deve ser um e-mail válido' }),
      error('name', { isNotEmpty: 'name não pode ser vazio' }),
    ]);

    expect(details).toEqual([
      { field: 'email', messages: ['email deve ser um e-mail válido'] },
      { field: 'name', messages: ['name não pode ser vazio'] },
    ]);
  });

  it('usa caminho com ponto para campos aninhados', () => {
    const details = flattenValidationErrors([
      error('address', undefined, [
        error('zipCode', { matches: 'zipCode inválido' }),
      ]),
    ]);

    expect(details).toEqual([
      { field: 'address.zipCode', messages: ['zipCode inválido'] },
    ]);
  });

  it('gera BadRequestException com mensagem e detalhes', () => {
    const exception = validationExceptionFactory([
      error('email', { isEmail: 'inválido' }),
    ]);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getResponse()).toEqual({
      message: 'Dados inválidos.',
      details: [{ field: 'email', messages: ['inválido'] }],
    });
  });
});
