import { BadRequestException, ValidationError } from '@nestjs/common';
import { FieldErrorDto } from '../errors/error-response';

/** Achata erros aninhados do class-validator em `campo.subcampo`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldErrorDto[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    const nested = flattenValidationErrors(error.children ?? [], field);
    return [...own, ...nested];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    message: 'Dados inválidos.',
    details: flattenValidationErrors(errors),
  });
}
