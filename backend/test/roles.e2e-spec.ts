import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { hashPassword } from '../src/auth/password';
import { SESSION_COOKIE } from '../src/auth/session-cookie';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createTestPrisma } from './support/prisma';

/** Controller só de teste: nenhuma regra de negócio de papéis existe ainda. */
@Controller('roles-test')
class RolesTestController {
  @Get('admin')
  @Roles(Role.ADMIN)
  adminOnly() {
    return { ok: true };
  }

  @Get('any')
  anyAuthenticated() {
    return { ok: true };
  }
}

describe('Papéis (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let firmId: string;
  const cookies: Partial<Record<Role, string>> = {};
  const password = 'password-de-teste-e2e';

  beforeAll(async () => {
    app = await createTestApp({ controllers: [RolesTestController] });
    prisma = createTestPrisma();

    const firm = await prisma.accountingFirm.create({
      data: { name: 'Escritório Papéis' },
    });
    firmId = firm.id;
    const passwordHash = await hashPassword(password);
    for (const role of [Role.ADMIN, Role.VIEWER]) {
      const email = `papel-${randomUUID()}@tribu.example`;
      await prisma.user.create({
        data: {
          accountingFirmId: firmId,
          name: role,
          email,
          passwordHash,
          role,
        },
      });
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `203.0.113.${role === Role.ADMIN ? 1 : 2}`)
        .send({ email, password })
        .expect(200);
      const setCookie = ([] as string[])
        .concat(response.headers['set-cookie'] ?? [])
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
      cookies[role] = setCookie?.split(';')[0];
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { accountingFirmId: firmId } });
    await prisma.accountingFirm.delete({ where: { id: firmId } });
    await prisma.$disconnect();
    await app.close();
  });

  function get(path: string, role?: Role) {
    const req = request(app.getHttpServer()).get(`/api/v1/roles-test/${path}`);
    return role ? req.set('Cookie', cookies[role] ?? '') : req;
  }

  it('papel permitido acede à rota', async () => {
    await get('admin', Role.ADMIN).expect(200);
  });

  it('papel não permitido recebe 403', async () => {
    const response = await get('admin', Role.VIEWER).expect(403);
    expect(response.body.message).toBe('Sem permissão para esta operação.');
  });

  it('sem sessão recebe 401, antes da verificação de papel', async () => {
    await get('admin').expect(401);
  });

  it('rota sem @Roles() aceita qualquer utilizador autenticado', async () => {
    await get('any', Role.VIEWER).expect(200);
    await get('any').expect(401);
  });
});
