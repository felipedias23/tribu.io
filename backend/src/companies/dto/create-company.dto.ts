import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/normalize';
import {
  IsCnpj,
  NAME_MAX_LENGTH,
  NormalizeCnpj,
  TrimToNull,
} from './company-fields';

/** Dados de uma empresa nova. O escritório vem da sessão, nunca do corpo. */
export class CreateCompanyDto {
  @ApiProperty({
    example: '12.ABC.345/01DE-35',
    description: 'Numérico ou alfanumérico, com ou sem máscara.',
  })
  @NormalizeCnpj()
  @IsCnpj()
  cnpj: string;

  @ApiProperty({ example: 'Oficina Exemplo Ltda', maxLength: NAME_MAX_LENGTH })
  @Trim()
  @IsString({ message: 'A razão social é obrigatória.' })
  @Length(1, NAME_MAX_LENGTH, {
    message: `A razão social deve ter entre 1 e ${NAME_MAX_LENGTH} caracteres.`,
  })
  legalName: string;

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
