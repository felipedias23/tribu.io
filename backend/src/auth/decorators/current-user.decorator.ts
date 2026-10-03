import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
  TenantId,
} from '../authenticated-user';

function authenticatedUser(context: ExecutionContext): AuthenticatedUser {
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!user) {
    // Erro de programação: decorator usado numa rota @Public().
    throw new Error('Rota sem utilizador autenticado.');
  }
  return user;
}

/** Utilizador da sessão atual. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    authenticatedUser(context),
);

/**
 * Escritório (tenant) da sessão atual. É a única origem válida do tenant:
 * nunca usar `accountingFirmId` vindo do corpo, da query ou da URL.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantId =>
    authenticatedUser(context).accountingFirmId,
);
