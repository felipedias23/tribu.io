import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

let dummyHash: Promise<string> | undefined;

/**
 * Compara a password com o hash. Sem hash (utilizador inexistente), verifica
 * contra um hash fictício e devolve false: a resposta demora o mesmo tempo e
 * não revela se o email tem conta.
 */
export async function verifyPassword(
  hash: string | null,
  password: string,
): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
}
