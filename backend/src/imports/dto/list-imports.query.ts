import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MAX_PAGE,
  MAX_PAGE_SIZE,
} from '../../companies/dto/list-companies.query';

export class ListImportsQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser pelo menos 1.' })
  @Max(MAX_PAGE, { message: `A página deve ser no máximo ${MAX_PAGE}.` })
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
