import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validUrl = 'postgresql://user:pass@localhost:5432/tribu';

  it('aplica valores padrão quando variáveis opcionais estão ausentes', () => {
    expect(validateEnv({ DATABASE_URL: validUrl })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validUrl,
    });
  });

  it('converte PORT para número', () => {
    expect(validateEnv({ DATABASE_URL: validUrl, PORT: '4000' }).PORT).toBe(
      4000,
    );
  });

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('falha quando DATABASE_URL não é uma URL PostgreSQL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('falha com NODE_ENV desconhecido', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: validUrl, NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/);
  });
});
