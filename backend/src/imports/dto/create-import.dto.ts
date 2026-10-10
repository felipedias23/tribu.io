import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../auth/dto/normalize';
import { IMPORT_LIMITS } from '../reading/limits';

/** Base64 de 2 MB (D35): cada 3 bytes ocupam 4 caracteres. */
export const MAX_BASE64_LENGTH = Math.ceil(IMPORT_LIMITS.maxFileBytes / 3) * 4;

export const DEFAULT_ORIGIN = 'Importação de ficheiros';

/**
 * Ficheiro em base64 dentro de JSON (D35): a S27 não ganha exceção. O
 * conteúdo é validado pelos primeiros bytes, não pelo nome.
 */
export class CreateImportDto {
  @ApiProperty({ example: 'carteira.xlsx', maxLength: 255 })
  @Trim()
  @IsString({ message: 'O nome do ficheiro é obrigatório.' })
  @Length(1, 255, {
    message: 'O nome do ficheiro deve ter entre 1 e 255 caracteres.',
  })
  fileName: string;

  @ApiProperty({ description: 'Conteúdo do ficheiro em base64 (até 2 MB).' })
  @IsString({ message: 'Envie o conteúdo do ficheiro.' })
  @MaxLength(MAX_BASE64_LENGTH, {
    message: 'O ficheiro excede o tamanho máximo de 2 MB.',
  })
  @Matches(/^[A-Za-z0-9+/]*={0,2}$/, {
    message: 'O conteúdo não está em base64.',
  })
  contentBase64: string;

  @ApiPropertyOptional({
    example: 'Sistema contábil X',
    maxLength: 100,
    description: `Origem dos dados (D36). Padrão: "${DEFAULT_ORIGIN}".`,
  })
  @IsOptional()
  @Trim()
  @IsString({ message: 'A origem deve ser um texto.' })
  @Length(1, 100, { message: 'A origem deve ter entre 1 e 100 caracteres.' })
  origin?: string;
}
