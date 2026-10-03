import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client';
import type { AuthenticatedRequest } from '../authenticated-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Guard global, executado depois do AuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Sem permissão para esta operação.');
    }
    return true;
  }
}
