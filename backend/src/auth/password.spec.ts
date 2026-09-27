import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('gera hash argon2id que não contém a password', async () => {
    const hash = await hashPassword('password-de-teste');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('password-de-teste');
  });

  it('aceita a password certa e rejeita a errada', async () => {
    const hash = await hashPassword('password-de-teste');

    await expect(verifyPassword(hash, 'password-de-teste')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'outra-password')).resolves.toBe(false);
  });

  it('sem hash (utilizador inexistente) devolve false', async () => {
    await expect(verifyPassword(null, 'qualquer')).resolves.toBe(false);
  });
});
