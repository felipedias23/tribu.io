import type { Request } from 'express';
import type { Role } from '../generated/prisma/client';

/**
 * ID de um escritório (tenant) obtido da sessão autenticada. O tipo distinto
 * impede que um service do tenant receba uma string qualquer vinda do pedido:
 * a única origem é `@CurrentTenant()`.
 */
export type TenantId = string & { readonly __brand: 'TenantId' };

/** Utilizador da sessão atual, reconstruído da base de dados a cada pedido. */
export interface AuthenticatedUser {
  id: string;
  accountingFirmId: TenantId;
  role: Role;
  name: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
