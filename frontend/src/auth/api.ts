import { ApiError, apiRequest } from '../shared/api/http';

/** Papéis definidos na Fase 1 (D4). */
export type UserRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

/** Espelha AuthUserResponse do backend. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountingFirm: { id: string; name: string };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  firmName: string;
  name: string;
}

export function login(input: LoginInput): Promise<AuthUser> {
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function register(input: RegisterInput): Promise<AuthUser> {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function logout(): Promise<void> {
  return apiRequest('/auth/logout', { method: 'POST' });
}

/** Utilizador da sessão atual, ou null se não houver sessão válida. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return await apiRequest<AuthUser>('/auth/me', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
