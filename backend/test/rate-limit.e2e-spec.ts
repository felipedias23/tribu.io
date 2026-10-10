import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API_RATE_LIMIT } from '../src/auth/decorators/strict-throttle.decorator';
import { createTestApp } from './support/app';

// D44: rate limit por IP em cada rota, verificado antes da sessão. O login,
// o registo e a prévia da importação têm o limite mais baixo, testado nos
// próprios specs.
describe('Rate limit global (e2e, D44)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, ip: string) =>
    request(app.getHttpServer()).get(path).set('X-Forwarded-For', ip);

  it(`limita a ${API_RATE_LIMIT} pedidos por minuto por IP numa rota pública`, async () => {
    for (let i = 0; i < API_RATE_LIMIT; i += 1) {
      await get('/api/v1/health', '198.51.100.1').expect(200);
    }
    const { body } = await get('/api/v1/health', '198.51.100.1').expect(429);
    expect(body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });

    await get('/api/v1/health', '198.51.100.2').expect(200);
  });

  it('recusa o excesso antes de ler a sessão e conta cada rota à parte', async () => {
    const ip = '198.51.100.3';
    for (let i = 0; i < API_RATE_LIMIT; i += 1) {
      await get('/api/v1/radar', ip).expect(401);
    }
    await get('/api/v1/radar', ip).expect(429);

    await get('/api/v1/companies', ip).expect(401);
  });
});
