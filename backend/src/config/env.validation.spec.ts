import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const required = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/tribu',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('aplica valores padrão quando variáveis opcionais estão ausentes', () => {
    expect(validateEnv(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY_HOPS: 1,
      COOKIE_SECURE: false,
    });
  });

  it('converte PORT para número', () => {
    expect(validateEnv({ ...required, PORT: '4000' }).PORT).toBe(4000);
  });

  it('falha quando DATABASE_URL está ausente ou não é PostgreSQL', () => {
    expect(() => validateEnv({ JWT_SECRET: required.JWT_SECRET })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      validateEnv({ ...required, DATABASE_URL: 'mysql://x' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('falha com NODE_ENV desconhecido', () => {
    expect(() => validateEnv({ ...required, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('exige JWT_SECRET com pelo menos 32 caracteres', () => {
    expect(() => validateEnv({ DATABASE_URL: required.DATABASE_URL })).toThrow(
      /JWT_SECRET/,
    );
    expect(() => validateEnv({ ...required, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('ativa COOKIE_SECURE por padrão em produção e respeita o valor explícito', () => {
    expect(
      validateEnv({ ...required, NODE_ENV: 'production' }).COOKIE_SECURE,
    ).toBe(true);
    expect(
      validateEnv({
        ...required,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }).COOKIE_SECURE,
    ).toBe(false);
    expect(() => validateEnv({ ...required, COOKIE_SECURE: 'sim' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});
