import type { UserRole } from '../auth/api';

/**
 * ADMIN e ANALYST cadastram e editam empresas; VIEWER só consulta (D20).
 * Esconder ações é só conveniência: quem autoriza é o backend (S24).
 */
export function canEditCompanies(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ANALYST';
}
