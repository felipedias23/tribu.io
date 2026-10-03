import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/app';

// Requer PostgreSQL acessível via DATABASE_URL (docker compose up db, ou o
// serviço postgres do CI).
describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health responde 200 com o banco disponível', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('pedido inválido devolve o formato de erro padronizado', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rota-inexistente')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.any(String),
      path: '/api/v1/rota-inexistente',
      timestamp: expect.any(String),
    });
  });

  it('GET /api/docs-json publica o documento OpenAPI', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.info.title).toBe('Tribu.io API');
    expect(response.body.paths).toHaveProperty('/api/v1/health');
  });
});
