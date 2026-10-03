import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createCompany } from './support/companies';
import { createTestPrisma } from './support/prisma';
import {
  type Account,
  createTenant,
  deleteTenants,
  type Tenant,
} from './support/tenants';

const EMPTY = {
  taxRegime: null,
  cnae: null,
  city: null,
  state: null,
  revenue12m: null,
  payroll12m: null,
  referencePeriod: null,
  updatedAt: null,
};

describe('Perfil tributário (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;

  const path = (companyId: string) =>
    `/api/v1/companies/${companyId}/tax-profile`;

  function get(account: Account, companyId: string) {
    return request(app.getHttpServer())
      .get(path(companyId))
      .set('Cookie', account.cookie);
  }

  function put(account: Account, companyId: string, body: object) {
    return request(app.getHttpServer())
      .put(path(companyId))
      .set('Cookie', account.cookie)
      .send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Perfil A');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a]);
    await prisma.$disconnect();
    await app.close();
  });

  it('empresa sem perfil devolve todos os campos ausentes (null)', async () => {
    const company = await createCompany(prisma, a.firmId);

    const response = await get(a.viewer, company.id).expect(200);

    expect(response.body).toEqual(EMPTY);
  });

  it('ADMIN e ANALYST preenchem o perfil; máscaras e números são normalizados', async () => {
    const company = await createCompany(prisma, a.firmId);

    const response = await put(a.analyst, company.id, {
      taxRegime: 'SIMPLES_NACIONAL',
      cnae: '6201-5/01',
      city: '  São Paulo ',
      state: 'sp',
      revenue12m: 1200000,
      payroll12m: '360000.5',
      referencePeriod: '2026-09',
    }).expect(200);

    expect(response.body).toMatchObject({
      taxRegime: 'SIMPLES_NACIONAL',
      cnae: '6201501',
      city: 'São Paulo',
      state: 'SP',
      revenue12m: '1200000.00',
      payroll12m: '360000.50',
      referencePeriod: '2026-09',
    });
    await expect(
      get(a.viewer, company.id).then((r) => r.body as object),
    ).resolves.toEqual(response.body);

    await put(a.admin, company.id, { taxRegime: 'LUCRO_PRESUMIDO' }).expect(
      200,
    );
  });

  it('zero é um valor conhecido; campo omitido fica ausente (null)', async () => {
    const company = await createCompany(prisma, a.firmId);
    await put(a.admin, company.id, {
      revenue12m: '500000.00',
      payroll12m: '100000.00',
    }).expect(200);

    const response = await put(a.admin, company.id, {
      payroll12m: '0',
    }).expect(200);

    expect(response.body.payroll12m).toBe('0.00');
    expect(response.body.revenue12m).toBeNull();
    expect(
      await prisma.taxProfile.count({ where: { companyId: company.id } }),
    ).toBe(1);
  });

  it('recusa valores negativos e formatos inválidos, com erro por campo', async () => {
    const company = await createCompany(prisma, a.firmId);

    const response = await put(a.admin, company.id, {
      taxRegime: 'MEI',
      cnae: '123',
      state: 'XX',
      revenue12m: '-1',
      payroll12m: -50,
      referencePeriod: '2026-13',
    }).expect(400);

    const fields = (response.body.details as { field: string }[])
      .map((detail) => detail.field)
      .sort();
    expect(fields).toEqual([
      'cnae',
      'payroll12m',
      'referencePeriod',
      'revenue12m',
      'state',
      'taxRegime',
    ]);
  });

  it('recusa campos fora do contrato, como o escritório ou a empresa', async () => {
    const company = await createCompany(prisma, a.firmId);

    await put(a.admin, company.id, { accountingFirmId: a.firmId }).expect(400);
    await put(a.admin, company.id, { companyId: company.id }).expect(400);
  });

  it('VIEWER consulta, mas não altera (403)', async () => {
    const company = await createCompany(prisma, a.firmId);

    await put(a.viewer, company.id, { revenue12m: '1.00' }).expect(403);
    expect(
      await prisma.taxProfile.count({ where: { companyId: company.id } }),
    ).toBe(0);
  });

  it('empresa inexistente responde 404', async () => {
    await get(a.admin, '00000000-0000-4000-8000-000000000000').expect(404);
    await put(a.admin, '00000000-0000-4000-8000-000000000000', {}).expect(404);
  });

  it('o banco recusa um perfil ligado a uma empresa de outro escritório (FK composta)', async () => {
    const other = await createTenant(app, prisma, 'Perfil Outro');
    const company = await createCompany(prisma, other.firmId);

    await expect(
      prisma.taxProfile.create({
        data: { accountingFirmId: a.firmId, companyId: company.id },
      }),
    ).rejects.toThrow();

    await deleteTenants(prisma, [other]);
  });
});
