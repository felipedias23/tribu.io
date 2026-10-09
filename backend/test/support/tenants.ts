import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { hashPassword } from '../../src/auth/password';
import { SESSION_COOKIE } from '../../src/auth/session-cookie';
import { PrismaClient, Role } from '../../src/generated/prisma/client';

export const TEST_PASSWORD = 'password-de-teste-e2e';

export interface Account {
  id: string;
  cookie: string;
}

export interface Tenant {
  firmId: string;
  admin: Account;
  analyst: Account;
  viewer: Account;
}

let ipCounter = 0;

/**
 * Cria um escritório com um utilizador por papel, já autenticados. Cada login
 * usa um IP próprio para não esbarrar no rate limit.
 */
export async function createTenant(
  app: NestExpressApplication,
  prisma: PrismaClient,
  label: string,
): Promise<Tenant> {
  const firm = await prisma.accountingFirm.create({
    data: { name: `Escritório ${label}` },
  });
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const accounts = {} as Record<'admin' | 'analyst' | 'viewer', Account>;

  for (const [key, role] of [
    ['admin', Role.ADMIN],
    ['analyst', Role.ANALYST],
    ['viewer', Role.VIEWER],
  ] as const) {
    const email = `tenant-${randomUUID()}@tribu.example`;
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
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const setCookie = ([] as string[])
      .concat(response.headers['set-cookie'] ?? [])
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    accounts[key] = { id: user.id, cookie: setCookie?.split(';')[0] ?? '' };
  }
  return { firmId: firm.id, ...accounts };
}

/** Remove os escritórios criados pelo teste e todos os seus dados. */
export async function deleteTenants(
  prisma: PrismaClient,
  tenants: (Tenant | undefined)[],
): Promise<void> {
  const firmIds = tenants.flatMap((tenant) => (tenant ? [tenant.firmId] : []));
  await prisma.analysis.deleteMany({
    where: { accountingFirmId: { in: firmIds } },
  });
  await prisma.taxProfile.deleteMany({
    where: { accountingFirmId: { in: firmIds } },
  });
  await prisma.company.deleteMany({
    where: { accountingFirmId: { in: firmIds } },
  });
  await prisma.user.deleteMany({
    where: { accountingFirmId: { in: firmIds } },
  });
  await prisma.accountingFirm.deleteMany({ where: { id: { in: firmIds } } });
}
