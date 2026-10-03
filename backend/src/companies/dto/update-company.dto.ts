import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../auth/dto/normalize';
import {
  IsCnpj,
  NAME_MAX_LENGTH,
  NormalizeCnpj,
  TrimToNull,
} from './company-fields';

/** Só undefined dispensa a validação: null num campo obrigatório é recusado. */
const IsPresent = () => ValidateIf((_object, value) => value !== undefined);

/**
 * Campos que mudam. Os ausentes ficam como estão; `tradeName: null` remove o
 * nome fantasia.
 */
export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: '12.ABC.345/01DE-35' })
  @IsPresent()
  @NormalizeCnpj()
  @IsCnpj()
  cnpj?: string;

  @ApiPropertyOptional({
    example: 'Oficina Exemplo Ltda',
    maxLength: NAME_MAX_LENGTH,
  })
  @IsPresent()
  @Trim()
  @IsString({ message: 'A razão social deve ser um texto.' })
  @Length(1, NAME_MAX_LENGTH, {
    message: `A razão social deve ter entre 1 e ${NAME_MAX_LENGTH} caracteres.`,
  })
  legalName?: string;

  @ApiPropertyOptional({
    example: 'Oficina Exemplo',
    maxLength: NAME_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @TrimToNull()
  @IsString({ message: 'O nome fantasia deve ser um texto.' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `O nome fantasia deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`,
  })
  tradeName?: string | null;
}
