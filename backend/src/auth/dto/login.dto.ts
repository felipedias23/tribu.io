import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from './normalize';
import { PASSWORD_MAX_LENGTH } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'admin@alfa.tribu.example' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Informe um email válido.' })
  @MaxLength(254, { message: 'O email deve ter no máximo 254 caracteres.' })
  email: string;

  @ApiProperty({ example: 'a-sua-password' })
  @IsString({ message: 'A password é obrigatória.' })
  @IsNotEmpty({ message: 'A password é obrigatória.' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `A password deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  })
  password: string;
}
