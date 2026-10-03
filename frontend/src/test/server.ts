import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AuthUser } from '../auth/api';

export const demoUser: AuthUser = {
  id: '11111111-0000-4000-8000-000000000001',
  name: 'Admin Alfa',
  email: 'admin@alfa.tribu.example',
  role: 'ADMIN',
  accountingFirm: { id: '11111111-1111-4111-8111-111111111111', name: 'Alfa Contabilidade' },
};

export function errorResponse(status: number, message: string, details?: { field: string; messages: string[] }[]) {
  return HttpResponse.json({ statusCode: status, error: 'Error', message, details }, { status });
}

/** Por omissão: API disponível e sem sessão. Cada teste sobrepõe o que precisa. */
export const server = setupServer(
  http.get('/api/v1/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('/api/v1/auth/me', () => errorResponse(401, 'Sessão inválida ou expirada.')),
  http.get('/api/v1/companies', () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 })),
);
