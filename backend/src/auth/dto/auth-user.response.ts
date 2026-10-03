import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';

export class AccountingFirmSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Alfa Contabilidade' })
  name: string;
}

/**
 * Dados do utilizador autenticado expostos ao frontend. Nunca inclui
 * passwordHash, tokenVersion nem o token de sessão.
 */
export class AuthUserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@alfa.example' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ type: AccountingFirmSummary })
  accountingFirm: AccountingFirmSummary;
}
