import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/app';

/** Cabeçalhos de segurança do helmet (D23: antes do deploy). */
describe('Cabeçalhos de segurança (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/api/v1/health', '/api/v1/auth/me', '/api/v1/rota-inexistente'])(
    '%s responde com os cabeçalhos do helmet',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path);

      expect(response.headers).toMatchObject({
        'content-security-policy': expect.stringContaining(
          "frame-ancestors 'self'",
        ) as string,
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'strict-transport-security': expect.stringContaining(
          'max-age=',
        ) as string,
        'referrer-policy': 'no-referrer',
      });
      expect(response.headers).not.toHaveProperty('x-powered-by');
      // Ambiente de testes sem HTTPS (COOKIE_SECURE=false).
      expect(response.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    },
  );

  it('o Swagger UI só carrega scripts por ficheiro, permitidos pela CSP', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/docs/')
      .expect(200);
    const html = page.text;

    expect(page.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    // Um <script> sem src seria bloqueado pela CSP e o Swagger ficaria em branco.
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    expect(inline).toEqual([]);

    const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      expect(src).not.toMatch(/^https?:/);
      await request(app.getHttpServer())
        .get(new URL(src, 'http://x/api/docs/').pathname)
        .expect(200);
    }
  });
});
