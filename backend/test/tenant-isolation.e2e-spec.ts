import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { SESSION_COOKIE } from '../src/auth/session-cookie';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantScopeViolationError } from '../src/prisma/tenant-scope';
import { createTestApp } from './support/app';
import { createTestPrisma } from './support/prisma';

const PASSWORD = 'password-de-teste-e2e';

interface Account {
  id: string;
  cookie: string;
}

interface Tenant {
  firmId: string;
  admin: Account;
  analyst: Account;
  viewer: Account;
}

/**
 * Dois escritórios, A e B, cada um com ADMIN, ANALYST e VIEWER. Nenhum pedido
 * de A pode ler, alterar ou sequer confirmar a existência de dados de B.
 */
describe('Isolamento entre tenants (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;
  let ipCounter = 0;

  async function createTenant(label: string): Promise<Tenant> {
    const firm = await prisma.accountingFirm.create({
      data: { name: `Escritório ${label}` },
    });
    const passwordHash = await hashPassword(PASSWORD);
    const accounts = {} as Record<'admin' | 'analyst' | 'viewer', Account>;

    for (const [key, role] of [
      ['admin', Role.ADMIN],
      ['analyst', Role.ANALYST],
      ['viewer', Role.VIEWER],
    ] as const) {
      const email = `isolamento-${randomUUID()}@tribu.example`;
      const user = await prisma.user.create({
        data: {
          accountingFirmId: firm.id,
          name: `${role} ${label}`,
          email,
          passwordHash,
          role,
        },
      });
      ipCounter += 1;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `192.0.2.${ipCounter}`)
        .send({ email, password: PASSWORD })
        .expect(200);
      const setCookie = ([] as string[])
        .concat(response.headers['set-cookie'] ?? [])
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
      accounts[key] = { id: user.id, cookie: setCookie?.split(';')[0] ?? '' };
    }
    return { firmId: firm.id, ...accounts };
  }

  function listUsers(account: Account, query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/users${query}`)
      .set('Cookie', account.cookie);
  }

  function updateUser(account: Account, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}`)
      .set('Cookie', account.cookie)
      .send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant('A');
    b = await createTenant('B');
  });

  afterAll(async () => {
    const firmIds = [a?.firmId, b?.firmId].filter(Boolean);
    await prisma.user.deleteMany({
      where: { accountingFirmId: { in: firmIds } },
    });
    await prisma.accountingFirm.deleteMany({ where: { id: { in: firmIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('o PrismaService da aplicação recusa queries sem tenant (D16)', async () => {
    const scoped = app.get<PrismaService>(PrismaService);

    await expect(scoped.user.findMany()).rejects.toThrow(
      TenantScopeViolationError,
    );
    await expect(
      scoped.user.findMany({ where: { accountingFirmId: a.firmId } }),
    ).resolves.toHaveLength(3);
  });

  describe('GET /users', () => {
    it('lista apenas os utilizadores do próprio escritório', async () => {
      const responseA = await listUsers(a.viewer).expect(200);
      const responseB = await listUsers(b.viewer).expect(200);

      const idsA = (responseA.body as { id: string }[]).map((u) => u.id);
      const idsB = (responseB.body as { id: string }[]).map((u) => u.id);
      expect(idsA.sort()).toEqual(
        [a.admin.id, a.analyst.id, a.viewer.id].sort(),
      );
      expect(idsB.sort()).toEqual(
        [b.admin.id, b.analyst.id, b.viewer.id].sort(),
      );
    });

    it('ignora filtros de tenant enviados na query', async () => {
      const response = await listUsers(
        a.admin,
        `?accountingFirmId=${b.firmId}&tenantId=${b.firmId}`,
      ).expect(200);

      const ids = (response.body as { id: string }[]).map((u) => u.id);
      expect(ids).not.toContain(b.admin.id);
      expect(ids).toContain(a.admin.id);
    });

    it('não expõe campos de autenticação', async () => {
      const response = await listUsers(a.admin).expect(200);

      expect(Object.keys((response.body as object[])[0]).sort()).toEqual([
        'email',
        'id',
        'name',
        'role',
      ]);
    });

    it('exige sessão', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });
  });

  describe('PATCH /users/:id', () => {
    it('ADMIN altera nome e papel de um utilizador do próprio escritório', async () => {
      const response = await updateUser(a.admin, a.analyst.id, {
        name: 'Analista Renomeado',
        role: Role.ANALYST,
      }).expect(200);

      expect(response.body).toMatchObject({
        id: a.analyst.id,
        name: 'Analista Renomeado',
        role: Role.ANALYST,
      });
    });

    it('um ID de outro escritório responde 404, igual a um ID inexistente, sem alterar nada', async () => {
      const crossTenant = await updateUser(a.admin, b.analyst.id, {
        name: 'Invadido',
        role: Role.ADMIN,
      }).expect(404);
      const missing = await updateUser(a.admin, randomUUID(), {
        name: 'Invadido',
      }).expect(404);

      expect(crossTenant.body.message).toBe(missing.body.message);
      const target = await prisma.user.findUniqueOrThrow({
        where: { id: b.analyst.id },
      });
      expect(target.name).toBe('ANALYST B');
      expect(target.role).toBe(Role.ANALYST);
    });

    it('rejeita tentativa de mudar o utilizador de escritório pelo corpo', async () => {
      await updateUser(a.admin, a.viewer.id, {
        accountingFirmId: b.firmId,
      }).expect(400);

      const viewer = await prisma.user.findUniqueOrThrow({
        where: { id: a.viewer.id },
      });
      expect(viewer.accountingFirmId).toBe(a.firmId);
    });

    it('apenas ADMIN pode alterar utilizadores (403 para ANALYST e VIEWER)', async () => {
      await updateUser(a.analyst, a.viewer.id, { name: 'X' }).expect(403);
      await updateUser(a.viewer, a.viewer.id, { role: Role.ADMIN }).expect(403);
    });

    it('não permite despromover o último ADMIN do escritório', async () => {
      const response = await updateUser(a.admin, a.admin.id, {
        role: Role.VIEWER,
      }).expect(409);

      expect(response.body.message).toBe(
        'O escritório precisa de pelo menos um ADMIN.',
      );
    });

    it('permite despromover um ADMIN quando existe outro', async () => {
      await updateUser(b.admin, b.analyst.id, { role: Role.ADMIN }).expect(200);

      await updateUser(b.admin, b.admin.id, { role: Role.ANALYST }).expect(200);
    });

    it('rejeita ID que não é UUID com 400', async () => {
      await updateUser(a.admin, 'nao-e-uuid', { name: 'X' }).expect(400);
    });
  });
});
