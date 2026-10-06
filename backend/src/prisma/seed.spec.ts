import { validateSeedEnv } from './seed';

describe('validateSeedEnv', () => {
  const env = {
    DATABASE_URL: 'postgresql://tribu:outra-senha@db:5432/tribu',
    SEED_PASSWORD: 'change-me-demo-only',
  };

  it('aceita os valores de exemplo fora de produção', () => {
    expect(validateSeedEnv({ ...env, NODE_ENV: 'development' })).toMatchObject(
      env,
    );
  });

  it('em produção, recusa a password de exemplo antes de criar contas (D19)', () => {
    expect(() => validateSeedEnv({ ...env, NODE_ENV: 'production' })).toThrow(
      /SEED_PASSWORD: valor de exemplo/,
    );
  });
});
