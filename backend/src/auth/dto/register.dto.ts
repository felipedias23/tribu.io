import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, Trim } from './normalize';

/** Limites da password (decisão aprovada: NIST 800-63B, sem regras de composição). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Registo público: cria o escritório e o primeiro utilizador (ADMIN).
 * Papel, tenant e demais campos internos não são aceites (whitelist).
 */
export class RegisterDto {
  @ApiProperty({ example: 'Alfa Contabilidade', minLength: 2, maxLength: 120 })
  @Trim()
  @IsString({ message: 'O nome do escritório é obrigatório.' })
  @Length(2, 120, {
    message: 'O nome do escritório deve ter entre 2 e 120 caracteres.',
  })
  firmName: string;

  @ApiProperty({ example: 'Maria Silva', minLength: 2, maxLength: 120 })
  @Trim()
  @IsString({ message: 'O nome é obrigatório.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name: string;

  @ApiProperty({ example: 'maria@alfa.example', maxLength: 254 })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Informe um email válido.' })
  @MaxLength(254, { message: 'O email deve ter no máximo 254 caracteres.' })
  email: string;

  @ApiProperty({
    example: 'uma-password-longa',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: 'A password é obrigatória.' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `A password deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`,
  })
  password: string;
}
