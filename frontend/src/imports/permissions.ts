import type { UserRole } from '../auth/api';

/**
 * ADMIN e ANALYST importam, confirmam e cancelam; VIEWER só consulta (D34).
 * Esconder ações é só conveniência: quem autoriza é o backend (S24).
 */
export function canImport(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ANALYST';
}
