import './support/swagger-disabled';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/app';

// D44: com SWAGGER_ENABLED=false (o padrão em produção) o mapa da API não é
// publicado.
describe('Swagger desligado (e2e, D44)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.SWAGGER_ENABLED;
  });

  it.each(['/api/docs/', '/api/docs-json'])('%s responde 404', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
  });

  it('a API continua a responder', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
