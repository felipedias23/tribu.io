import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  assertTenantScoped,
  TENANT_MODELS,
  TenantScopeViolationError,
  tenantScope,
} from './tenant-scope';

const TENANT = '11111111-1111-4111-8111-111111111111';

function check(operation: string, args?: Record<string, unknown>) {
  return () => assertTenantScoped('User', operation, args);
}

describe('Verificação de tenant no Prisma (D16)', () => {
  it('identifica os models do tenant pela coluna accountingFirmId', () => {
    expect([...TENANT_MODELS]).toEqual(['User']);
  });

  it('ignora models que não são do tenant', () => {
    expect(() =>
      assertTenantScoped('AccountingFirm', 'findMany', {}),
    ).not.toThrow();
  });

  describe('leitura e alteração', () => {
    it.each([
      'findUnique',
      'findUniqueOrThrow',
      'findFirst',
      'findFirstOrThrow',
      'findMany',
      'count',
      'aggregate',
      'groupBy',
      'update',
      'updateMany',
      'updateManyAndReturn',
      'delete',
      'deleteMany',
    ])('%s aceita accountingFirmId no nível superior do where', (operation) => {
      expect(
        check(operation, { where: { id: 'x', accountingFirmId: TENANT } }),
      ).not.toThrow();
    });

    it.each([
      ['sem argumentos', undefined],
      ['sem where', {}],
      ['where sem tenant', { where: { id: 'x' } }],
      [
        'tenant só dentro de OR',
        { where: { OR: [{ accountingFirmId: TENANT }] } },
      ],
      [
        'tenant só dentro de AND',
        { where: { AND: [{ accountingFirmId: TENANT }] } },
      ],
      [
        'tenant como filtro in',
        { where: { accountingFirmId: { in: [TENANT] } } },
      ],
      ['tenant vazio', { where: { accountingFirmId: '' } }],
    ])('recusa findMany %s', (_case, args) => {
      expect(check('findMany', args)).toThrow(TenantScopeViolationError);
    });

    it('recusa update que muda o escritório do registo', () => {
      expect(
        check('update', {
          where: { id: 'x', accountingFirmId: TENANT },
          data: { accountingFirmId: 'outro' },
        }),
      ).toThrow('o data não pode alterar accountingFirmId');
    });
  });

  describe('criação', () => {
    it('aceita create e createMany com accountingFirmId em cada registo', () => {
      expect(
        check('create', { data: { accountingFirmId: TENANT } }),
      ).not.toThrow();
      expect(
        check('createMany', {
          data: [{ accountingFirmId: TENANT }, { accountingFirmId: TENANT }],
        }),
      ).not.toThrow();
    });

    it('recusa create sem tenant e createMany com um registo sem tenant', () => {
      expect(check('create', { data: { name: 'x' } })).toThrow(
        'falta accountingFirmId no data',
      );
      expect(
        check('createManyAndReturn', {
          data: [{ accountingFirmId: TENANT }, { name: 'x' }],
        }),
      ).toThrow(TenantScopeViolationError);
    });
  });

  describe('upsert', () => {
    const where = { id: 'x', accountingFirmId: TENANT };

    it('aceita tenant no where e no create', () => {
      expect(
        check('upsert', {
          where,
          create: { accountingFirmId: TENANT },
          update: { name: 'y' },
        }),
      ).not.toThrow();
    });

    it('recusa create sem tenant ou update que muda o tenant', () => {
      expect(
        check('upsert', { where, create: { name: 'y' }, update: {} }),
      ).toThrow('falta accountingFirmId no create');
      expect(
        check('upsert', {
          where,
          create: { accountingFirmId: TENANT },
          update: { accountingFirmId: 'outro' },
        }),
      ).toThrow('o update não pode alterar accountingFirmId');
    });
  });

  it('recusa operações desconhecidas', () => {
    expect(check('findRaw', {})).toThrow('operação sem verificação de tenant');
  });

  it('a extensão recusa a query antes de chegar ao banco', async () => {
    // Porta sem banco: se a query não fosse recusada, falharia a ligar.
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://ninguem@127.0.0.1:9/inexistente',
      }),
    }).$extends(tenantScope);

    await expect(client.user.findMany()).rejects.toThrow(
      TenantScopeViolationError,
    );
    await expect(
      client.user.findFirst({ where: { id: TENANT } }),
    ).rejects.toThrow(TenantScopeViolationError);
  });
});
