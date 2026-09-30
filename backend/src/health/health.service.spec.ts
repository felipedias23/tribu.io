import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  function createService(queryRaw: jest.Mock) {
    return new HealthService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  }

  it('reporta ok quando o banco responde', async () => {
    const service = createService(
      jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('reporta erro quando o banco não responde', async () => {
    const service = createService(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
