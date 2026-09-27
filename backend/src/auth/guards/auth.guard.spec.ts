import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionService } from '../session.service';
import { SESSION_COOKIE } from '../session-cookie';
import { AuthGuard } from './auth.guard';

function createContext(request: object): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const user = { id: 'u1', accountingFirmId: 'f1', role: 'VIEWER' };
  let reflector: Reflector;
  let resolve: jest.Mock;
  let guard: AuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    resolve = jest.fn().mockResolvedValue(user);
    guard = new AuthGuard(reflector, { resolve } as unknown as SessionService);
  });

  it('deixa passar rotas @Public() sem consultar a sessão', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejeita pedido sem sessão válida com 401', async () => {
    resolve.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('anexa o utilizador autenticado ao pedido', async () => {
    const request: Record<string, unknown> = {
      cookies: { [SESSION_COOKIE]: 'token' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('token');
    expect(request.user).toBe(user);
  });
});
