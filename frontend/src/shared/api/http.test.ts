import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/server';
import { ApiError, apiRequest, onUnauthorized } from './http';

describe('apiRequest', () => {
  it('converte a resposta de erro padronizada da API em ApiError', async () => {
    server.use(
      http.get('/api/v1/qualquer', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: 'Dados inválidos.',
            details: [{ field: 'email', messages: ['email inválido'] }],
          },
          { status: 400 },
        ),
      ),
    );

    const error = await apiRequest('/qualquer').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Dados inválidos.' });
    expect((error as ApiError).fieldMessages('email')).toEqual(['email inválido']);
  });

  it('usa mensagem genérica quando a resposta não é JSON', async () => {
    server.use(http.get('/api/v1/qualquer', () => new HttpResponse('Bad Gateway', { status: 502 })));

    await expect(apiRequest('/qualquer')).rejects.toMatchObject({
      status: 502,
      message: 'Não foi possível comunicar com o servidor.',
    });
  });

  it('aceita respostas 204 sem corpo', async () => {
    server.use(http.post('/api/v1/sem-corpo', () => new HttpResponse(null, { status: 204 })));

    await expect(apiRequest('/sem-corpo', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('avisa a sessão expirada quando um pedido fora de /auth/* recebe 401', async () => {
    server.use(http.get('/api/v1/dados', () => HttpResponse.json({ message: 'x' }, { status: 401 })));
    const handler = vi.fn();
    const unsubscribe = onUnauthorized(handler);

    await expect(apiRequest('/dados')).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('não trata 401 de /auth/* como sessão expirada', async () => {
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.json({ message: 'x' }, { status: 401 })));
    const handler = vi.fn();
    const unsubscribe = onUnauthorized(handler);

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});
