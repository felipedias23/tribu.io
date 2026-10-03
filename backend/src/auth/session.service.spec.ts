import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';

const SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';

const storedUser = {
  id: '11111111-0000-4000-8000-000000000001',
  accountingFirmId: '11111111-1111-4111-8111-111111111111',
  role: 'ADMIN',
  name: 'Admin Alfa',
  email: 'admin@alfa.tribu.example',
  tokenVersion: 3,
};

describe('SessionService', () => {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', expiresIn: 60 },
    verifyOptions: { algorithms: ['HS256'] },
  });
  let findUnique: jest.Mock;
  let sessions: SessionService;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(storedUser);
    sessions = new SessionService(jwt, {
      user: { findUnique },
    } as unknown as PrismaService);
  });

  it('reconstrói o utilizador a partir de um token válido, sem tokenVersion', async () => {
    const token = await sessions.issue(storedUser);

    await expect(sessions.resolve(token)).resolves.toEqual({
      id: storedUser.id,
      accountingFirmId: storedUser.accountingFirmId,
      role: storedUser.role,
      name: storedUser.name,
      email: storedUser.email,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: storedUser.id } }),
    );
  });

  it('coloca no token apenas o id e a tokenVersion', async () => {
    const token = await sessions.issue(storedUser);

    expect(Object.keys(jwt.decode<object>(token)).sort()).toEqual([
      'exp',
      'iat',
      'sub',
      'tv',
    ]);
  });

  it('rejeita ausência de token', async () => {
    await expect(sessions.resolve(undefined)).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejeita token adulterado', async () => {
    const token = await sessions.issue(storedUser);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'outro-utilizador', tv: 3 }),
    ).toString('base64url');

    await expect(
      sessions.resolve(`${header}.${forgedPayload}.${signature}`),
    ).resolves.toBeNull();
  });

  it('rejeita token assinado com outro segredo ou outro algoritmo', async () => {
    const otherSecret = new JwtService({ secret: 'x'.repeat(40) });
    const otherAlgorithm = new JwtService({
      secret: SECRET,
      signOptions: { algorithm: 'HS512' },
    });
    const payload = { sub: storedUser.id, tv: 3 };

    await expect(
      sessions.resolve(await otherSecret.signAsync(payload)),
    ).resolves.toBeNull();
    await expect(
      sessions.resolve(await otherAlgorithm.signAsync(payload)),
    ).resolves.toBeNull();
  });

  it('rejeita token expirado', async () => {
    const expired = await jwt.signAsync(
      { sub: storedUser.id, tv: 3 },
      { expiresIn: -10 },
    );

    await expect(sessions.resolve(expired)).resolves.toBeNull();
  });

  it('rejeita utilizador inexistente', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      sessions.resolve(await sessions.issue(storedUser)),
    ).resolves.toBeNull();
  });

  it('rejeita sessão terminada (tokenVersion desatualizada)', async () => {
    const token = await sessions.issue(storedUser);
    findUnique.mockResolvedValue({ ...storedUser, tokenVersion: 4 });

    await expect(sessions.resolve(token)).resolves.toBeNull();
  });
});
