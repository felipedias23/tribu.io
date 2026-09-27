import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '../../generated/prisma/enums';
import { Trim } from '../../auth/dto/normalize';

/** Campos que um ADMIN pode alterar. Email, password e tenant não entram aqui. */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Maria Silva', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Trim()
  @IsString({ message: 'O nome deve ser um texto.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role, { message: 'Papel inválido. Use ADMIN, ANALYST ou VIEWER.' })
  role?: Role;
}
