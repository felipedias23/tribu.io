import type { UserRole } from '../auth/api';

/**
 * ADMIN e ANALYST executam análises; VIEWER só consulta (D27). Esconder o
 * botão é só conveniência: quem autoriza é o backend (S24).
 */
export function canRunAnalyses(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ANALYST';
}
