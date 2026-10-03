import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import { RolesGuard } from './roles.guard';

function createContext(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function requireRoles(roles: Role[] | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  it('sem @Roles(), deixa passar qualquer utilizador autenticado', () => {
    requireRoles(undefined);

    expect(guard.canActivate(createContext({ role: Role.VIEWER }))).toBe(true);
  });

  it('deixa passar um papel permitido', () => {
    requireRoles([Role.ADMIN, Role.ANALYST]);

    expect(guard.canActivate(createContext({ role: Role.ANALYST }))).toBe(true);
  });

  it('rejeita um papel não permitido com 403', () => {
    requireRoles([Role.ADMIN]);

    expect(() =>
      guard.canActivate(createContext({ role: Role.VIEWER })),
    ).toThrow(ForbiddenException);
  });

  it('rejeita pedido sem utilizador com 401', () => {
    requireRoles([Role.ADMIN]);

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });
});
