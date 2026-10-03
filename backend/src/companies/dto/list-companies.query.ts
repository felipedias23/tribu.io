import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/normalize';

/** Limite de itens por página (regra S15). */
export const MAX_PAGE_SIZE = 100;

export class ListCompaniesQuery {
  @ApiPropertyOptional({
    description: 'Parte da razão social, do nome fantasia ou do CNPJ.',
    maxLength: 100,
  })
  @IsOptional()
  @Trim()
  @IsString({ message: 'A pesquisa deve ser um texto.' })
  @MaxLength(100, { message: 'A pesquisa deve ter no máximo 100 caracteres.' })
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser pelo menos 1.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O tamanho da página deve ser um número inteiro.' })
  @Min(1, { message: 'O tamanho da página deve ser pelo menos 1.' })
  @Max(MAX_PAGE_SIZE, {
    message: `O tamanho da página deve ser no máximo ${MAX_PAGE_SIZE}.`,
  })
  pageSize: number = 20;
}
