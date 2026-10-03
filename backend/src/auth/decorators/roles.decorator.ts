import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe a rota aos papéis indicados. Sem @Roles(), qualquer utilizador
 * autenticado tem acesso.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
