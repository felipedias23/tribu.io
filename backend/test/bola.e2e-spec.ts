import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { BOLA_CASES, type BolaCase, routeKey } from './support/bola-matrix';
import { createTestPrisma } from './support/prisma';
import { createTenant, deleteTenants, type Tenant } from './support/tenants';

/**
 * Matriz BOLA (decisão D17, regra S3): o ADMIN do escritório A pede um recurso
 * do escritório B. A resposta tem de ser igual à de um ID inexistente (404,
 * mesma mensagem) e o recurso de B não pode mudar.
 */
describe('Matriz BOLA (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;

  function send(testCase: BolaCase, id: string) {
    const path = `/api/v1${testCase.path.replace(':id', id)}`;
    const method = testCase.method.toLowerCase() as Lowercase<
      BolaCase['method']
    >;
    const req = request(app.getHttpServer())
      [method](path)
      .set('Cookie', a.admin.cookie);
    return testCase.body ? req.send(testCase.body) : req;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'BOLA A');
    b = await createTenant(app, prisma, 'BOLA B');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a, b]);
    await prisma.$disconnect();
    await app.close();
  });

  it.each(BOLA_CASES.map((testCase) => [routeKey(testCase), testCase]))(
    '%s: recurso de outro escritório responde como inexistente',
    async (_route, testCase) => {
      const id = testCase.targetId(b);
      const before = await testCase.snapshot(prisma, id);

      const crossTenant = await send(testCase, id).expect(404);
      const missing = await send(testCase, randomUUID()).expect(404);

      // path e timestamp mudam com o pedido; o resto tem de ser igual.
      const { path: _p1, timestamp: _t1, ...crossBody } = crossTenant.body;
      const { path: _p2, timestamp: _t2, ...missingBody } = missing.body;
      expect(crossBody).toEqual(missingBody);
      await expect(testCase.snapshot(prisma, id)).resolves.toEqual(before);
    },
  );
});
