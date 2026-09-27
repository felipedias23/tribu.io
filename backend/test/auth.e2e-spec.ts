import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AUTH_RATE_LIMIT } from '../src/auth/auth.module';
import { SESSION_COOKIE } from '../src/auth/session-cookie';
import { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createTestPrisma, testEnv } from './support/prisma';

const PASSWORD = 'password-de-teste-e2e';

// Cada chamada usa um IP diferente (TEST-NET, RFC 5737) para que os testes não
// partilhem o limite de tentativas; o teste de rate limiting fixa um só IP.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function sessionCookieFrom(response: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const emails: string[] = [];

  function uniqueEmail(): string {
    const email = `auth-${randomUUID()}@tribu.example`;
    emails.push(email);
    return email;
  }

  function register(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send(body);
  }

  function login(email: string, password: string, ip = nextIp()) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  }

  function me(cookie?: string) {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return cookie ? req.set('Cookie', cookie) : req;
  }

  /** Regista um escritório novo e devolve o cabeçalho Cookie da sessão. */
  async function registerAccount(email = uniqueEmail()) {
    const response = await register({
      firmName: 'Escritório E2E',
      name: 'Utilizador E2E',
      email,
      password: PASSWORD,
    }).expect(201);
    const setCookie = sessionCookieFrom(response);
    if (!setCookie) throw new Error('Registo sem cookie de sessão.');
    return {
      email,
      user: response.body as { id: string; accountingFirm: { id: string } },
      cookie: cookieHeader(setCookie),
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { accountingFirmId: true },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.accountingFirm.deleteMany({
      where: { id: { in: users.map((user) => user.accountingFirmId) } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('cria o escritório e o primeiro utilizador como ADMIN e inicia sessão', async () => {
      const email = uniqueEmail();

      const response = await register({
        firmName: '  Escritório Novo  ',
        name: 'Maria Silva',
        email: `  ${email.toUpperCase()} `,
        password: PASSWORD,
      }).expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        name: 'Maria Silva',
        email,
        role: 'ADMIN',
        accountingFirm: { id: expect.any(String), name: 'Escritório Novo' },
      });
      const stored = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { accountingFirmId: true, role: true, passwordHash: true },
      });
      expect(stored.accountingFirmId).toBe(response.body.accountingFirm.id);
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(sessionCookieFrom(response)).toBeDefined();
    });

    it('define o cookie de sessão com httpOnly, SameSite=Strict e Path=/api', async () => {
      const response = await register({
        firmName: 'Escritório Cookie',
        name: 'Cookie',
        email: uniqueEmail(),
        password: PASSWORD,
      }).expect(201);

      const setCookie = sessionCookieFrom(response) ?? '';
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toMatch(/Path=\/api/);
      expect(setCookie).toMatch(/Max-Age=28800/);
    });

    it('não devolve token, passwordHash nem tokenVersion no corpo', async () => {
      const response = await register({
        firmName: 'Escritório Seguro',
        name: 'Seguro',
        email: uniqueEmail(),
        password: PASSWORD,
      }).expect(201);

      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/passwordHash|tokenVersion|token/);
      expect(body).not.toContain(PASSWORD);
    });

    it('rejeita dados inválidos com erros por campo', async () => {
      const response = await register({
        firmName: '',
        name: 'Nome',
        email: 'nao-e-email',
        password: 'curta',
      }).expect(400);

      expect(
        (response.body.details as { field: string }[]).map((d) => d.field),
      ).toEqual(expect.arrayContaining(['firmName', 'email', 'password']));
    });

    it('rejeita password acima do máximo', async () => {
      await register({
        firmName: 'Escritório',
        name: 'Nome',
        email: uniqueEmail(),
        password: 'x'.repeat(129),
      }).expect(400);
    });

    it('não permite ao cliente escolher papel, tenant ou tokenVersion', async () => {
      const email = uniqueEmail();
      const otherFirm = await prisma.accountingFirm.findFirstOrThrow();

      const response = await register({
        firmName: 'Tentativa',
        name: 'Atacante',
        email,
        password: PASSWORD,
        role: 'VIEWER',
        accountingFirmId: otherFirm.id,
        tokenVersion: 99,
      }).expect(400);

      expect(
        (response.body.details as { field: string }[]).map((d) => d.field),
      ).toEqual(
        expect.arrayContaining(['role', 'accountingFirmId', 'tokenVersion']),
      );
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('rejeita email já registado com 409 sem deixar escritório órfão', async () => {
      const { email } = await registerAccount();
      const firmName = `Duplicado ${randomUUID()}`;

      const response = await register({
        firmName,
        name: 'Outro',
        email: email.toUpperCase(),
        password: PASSWORD,
      }).expect(409);

      expect(response.body.message).toBe('Este email já está registado.');
      expect(
        await prisma.accountingFirm.count({ where: { name: firmName } }),
      ).toBe(0);
    });
  });

  describe('POST /auth/login', () => {
    it('inicia sessão com credenciais válidas, com email em qualquer caixa', async () => {
      const { email, user } = await registerAccount();

      const response = await login(email.toUpperCase(), PASSWORD).expect(200);

      expect(response.body).toEqual({
        id: user.id,
        name: 'Utilizador E2E',
        email,
        role: 'ADMIN',
        accountingFirm: { id: user.accountingFirm.id, name: 'Escritório E2E' },
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|tokenVersion|token/,
      );
      const setCookie = sessionCookieFrom(response);
      expect(setCookie).toBeDefined();
      await me(cookieHeader(setCookie ?? '')).expect(200);
    });

    it('responde igual para password errada e email inexistente', async () => {
      const { email } = await registerAccount();

      const wrongPassword = await login(email, 'password-errada').expect(401);
      const unknownEmail = await login(
        `ninguem-${randomUUID()}@tribu.example`,
        PASSWORD,
      ).expect(401);

      expect(wrongPassword.body.message).toBe('Email ou password incorretos.');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(sessionCookieFrom(wrongPassword)).toBeUndefined();
    });

    it(`limita a ${AUTH_RATE_LIMIT} tentativas por minuto por IP (429)`, async () => {
      const ip = nextIp();
      const email = `ninguem-${randomUUID()}@tribu.example`;

      for (let attempt = 0; attempt < AUTH_RATE_LIMIT; attempt += 1) {
        await login(email, 'errada', ip).expect(401);
      }
      await login(email, 'errada', ip).expect(429);
      await login(email, 'errada', nextIp()).expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('rejeita pedido sem sessão', async () => {
      const response = await me().expect(401);
      expect(response.body.message).toBe('Sessão inválida ou expirada.');
    });

    it('devolve o utilizador e o escritório da sessão', async () => {
      const { cookie, user, email } = await registerAccount();

      const response = await me(cookie).expect(200);

      expect(response.body).toEqual({
        id: user.id,
        name: 'Utilizador E2E',
        email,
        role: 'ADMIN',
        accountingFirm: { id: user.accountingFirm.id, name: 'Escritório E2E' },
      });
    });

    it('rejeita token adulterado', async () => {
      const { cookie } = await registerAccount();
      const [name, token] = cookie.split('=');
      const [header, payload, signature] = token.split('.');
      const tampered = `${header}.${payload}.${signature.slice(0, -2)}xx`;

      await me(`${name}=${tampered}`).expect(401);
    });

    it('rejeita token expirado', async () => {
      const { user } = await registerAccount();
      const secret = testEnv().JWT_SECRET;
      const expired = await new JwtService({ secret }).signAsync(
        { sub: user.id, tv: 0 },
        { expiresIn: -10 },
      );

      await me(`${SESSION_COOKIE}=${expired}`).expect(401);
    });

    it('rejeita sessão de utilizador que já não existe', async () => {
      const { cookie, user } = await registerAccount();
      await prisma.user.delete({ where: { id: user.id } });

      await me(cookie).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('apaga o cookie, incrementa tokenVersion e invalida a sessão anterior', async () => {
      const { cookie, user } = await registerAccount();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cleared = sessionCookieFrom(response) ?? '';
      expect(cleared).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { tokenVersion: true },
      });
      expect(stored.tokenVersion).toBe(1);
      await me(cookie).expect(401);
    });

    it('responde 204 mesmo sem sessão válida', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(204);
    });
  });
});
