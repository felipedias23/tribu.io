import type { UserRole } from './api';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  ANALYST: 'Analista',
  VIEWER: 'Consulta',
};
