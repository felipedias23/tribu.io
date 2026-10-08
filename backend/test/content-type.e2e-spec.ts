import type { NestExpressApplication } from '@nestjs/platform-express';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { uniqueCnpj } from './support/companies';
import { createTestPrisma } from './support/prisma';
import { createTenant, deleteTenants, type Tenant } from './support/tenants';

/** A API só aceita corpos em JSON: formulários de outro site não são lidos (CSRF). */
describe('Tipo do corpo dos pedidos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let tenant: Tenant;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    tenant = await createTenant(app, prisma, 'Tipo do Corpo');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [tenant]);
    await prisma.$disconnect();
    await app.close();
  });

  it.each([
    ['formulário HTML', 'application/x-www-form-urlencoded'],
    ['multipart', 'multipart/form-data; boundary=x'],
    ['texto', 'text/plain'],
  ])('recusa %s com 415 e não grava a empresa', async (_case, contentType) => {
    const cnpj = uniqueCnpj();

    const response = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Cookie', tenant.admin.cookie)
      .set('Content-Type', contentType)
      .send(`cnpj=${cnpj}&legalName=Formulario`)
      .expect(415);

    expect(response.body).toMatchObject({
      statusCode: 415,
      message: 'Envie os dados em JSON (Content-Type: application/json).',
      path: '/api/v1/companies',
    });
    expect(
      await prisma.company.count({
        where: { accountingFirmId: tenant.firmId, cnpj },
      }),
    ).toBe(0);
  });

  it('recusa um formulário enviado em chunks, sem Content-Length', async () => {
    const server: Server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            port,
            method: 'POST',
            path: '/api/v1/auth/login',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.write('email=x%40x.example&');
        req.end('password=qualquer-coisa');
      });
      expect(status).toBe(415);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('recusa um login por formulário com 415', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .type('form')
      .send({ email: 'x@x.example', password: 'qualquer-coisa' })
      .expect(415);
  });

  it('aceita JSON, também com charset', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Cookie', tenant.admin.cookie)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ cnpj: uniqueCnpj(), legalName: 'Json Ltda' }))
      .expect(201);
  });

  it('aceita pedidos sem corpo, como o logout', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Content-Type', 'text/plain')
      .expect(204);
  });
});
