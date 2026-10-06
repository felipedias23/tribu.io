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
      validateEnv({ ...required, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
    expect(() => validateEnv({ ...required, COOKIE_SECURE: 'sim' })).toThrow(
      /COOKIE_SECURE/,
    );
  });

  it('não expõe SEED_PASSWORD na configuração da API', () => {
    expect(
      validateEnv({ ...required, SEED_PASSWORD: 'password-local' }),
    ).not.toHaveProperty('SEED_PASSWORD');
  });

  describe('produção (D19, S25)', () => {
    const production = { ...required, NODE_ENV: 'production' };
    const example = {
      JWT_SECRET: 'change-me-local-only-with-at-least-32-characters',
      DATABASE_URL:
        'postgresql://tribu:change-me-local-only@db:5432/tribu?schema=public',
      SEED_PASSWORD: 'change-me-demo-only',
    };

    it.each(Object.entries(example))(
      'recusa o valor de exemplo em %s',
      (key, value) => {
        expect(() => validateEnv({ ...production, [key]: value })).toThrow(
          new RegExp(`${key}: valor de exemplo`),
        );
      },
    );

    it('recusa o valor de exemplo em qualquer caixa', () => {
      expect(() =>
        validateEnv({ ...production, SEED_PASSWORD: 'CHANGE-ME-demo' }),
      ).toThrow(/SEED_PASSWORD/);
    });

    it('recusa COOKIE_SECURE=false', () => {
      expect(() =>
        validateEnv({ ...production, COOKIE_SECURE: 'false' }),
      ).toThrow(/COOKIE_SECURE: não pode ser false em produção/);
    });

    it('lista todos os problemas de uma vez', () => {
      expect(() =>
        validateEnv({ ...production, ...example, COOKIE_SECURE: 'false' }),
      ).toThrow(
        /JWT_SECRET[\s\S]*DATABASE_URL[\s\S]*SEED_PASSWORD[\s\S]*COOKIE_SECURE/,
      );
    });

    it('arranca com valores próprios', () => {
      expect(
        validateEnv({ ...production, SEED_PASSWORD: 'outra-password-forte' }),
      ).toMatchObject({ NODE_ENV: 'production', COOKIE_SECURE: true });
    });

    it('em desenvolvimento e testes, os valores de exemplo continuam válidos', () => {
      for (const NODE_ENV of ['development', 'test']) {
        expect(() =>
          validateEnv({
            ...required,
            ...example,
            NODE_ENV,
            COOKIE_SECURE: 'false',
          }),
        ).not.toThrow();
      }
    });
  });
});
