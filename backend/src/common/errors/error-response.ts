import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FieldErrorDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: ['email deve ser um e-mail válido'] })
  messages: string[];
}

/** Formato padronizado de todas as respostas de erro da API. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Dados inválidos.' })
  message: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  details?: FieldErrorDto[];

  @ApiProperty({ example: '/api/v1/recurso' })
  path: string;

  @ApiProperty({ example: '2026-09-26T12:00:00.000Z' })
  timestamp: string;
}
