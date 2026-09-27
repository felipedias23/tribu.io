import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';

/** Utilizador visto pela equipa do escritório. Sem campos de autenticação. */
export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@alfa.example' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;
}
