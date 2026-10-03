import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { ApiError, apiRequest } from './http';

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
});
