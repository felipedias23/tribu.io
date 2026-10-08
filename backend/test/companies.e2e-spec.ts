import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createCompany, uniqueCnpj } from './support/companies';
import { createTestPrisma } from './support/prisma';
import {
  type Account,
  createTenant,
  deleteTenants,
  type Tenant,
} from './support/tenants';

/** 12.345.678/0001-95 com máscara → 12345678000195 (numérico válido). */
function masked(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

describe('Empresas (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;

  const api = () => request(app.getHttpServer());

  function create(account: Account, body: object) {
    return api()
      .post('/api/v1/companies')
      .set('Cookie', account.cookie)
      .send(body);
  }

  function update(account: Account, id: string, body: object) {
    return api()
      .patch(`/api/v1/companies/${id}`)
      .set('Cookie', account.cookie)
      .send(body);
  }

  function list(account: Account, query = '') {
    return api().get(`/api/v1/companies${query}`).set('Cookie', account.cookie);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Empresas A');
    b = await createTenant(app, prisma, 'Empresas B');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a, b]);
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /companies', () => {
    it('ADMIN e ANALYST cadastram; o CNPJ é guardado sem máscara', async () => {
      const cnpj = uniqueCnpj();
      const response = await create(a.admin, {
        cnpj: masked(cnpj).toLowerCase(),
        legalName: '  Oficina Teste Ltda  ',
        tradeName: '   ',
      }).expect(201);

      expect(response.body).toMatchObject({
        cnpj,
        legalName: 'Oficina Teste Ltda',
        tradeName: null,
      });
      expect(Object.keys(response.body as object).sort()).toEqual([
        'cnpj',
        'createdAt',
        'id',
        'legalName',
        'tradeName',
        'updatedAt',
      ]);

      await create(a.analyst, {
        cnpj: uniqueCnpj(),
        legalName: 'Cadastrada pelo Analista Ltda',
        tradeName: 'Analista',
      }).expect(201);
    });

    it('VIEWER não cadastra (403)', async () => {
      await create(a.viewer, {
        cnpj: uniqueCnpj(),
        legalName: 'Proibida Ltda',
      }).expect(403);
    });

    it('recusa CNPJ inválido com erro no campo', async () => {
      const response = await create(a.admin, {
        cnpj: '12.ABC.345/01DE-36',
        legalName: 'CNPJ Errado Ltda',
      }).expect(400);

      expect(response.body.details).toEqual([
        { field: 'cnpj', messages: ['Informe um CNPJ válido.'] },
      ]);
    });

    it('recusa campos fora do contrato, como o escritório', async () => {
      await create(a.admin, {
        cnpj: uniqueCnpj(),
        legalName: 'Outro Escritório Ltda',
        accountingFirmId: b.firmId,
      }).expect(400);
    });

    it('CNPJ repetido no mesmo escritório responde 409; noutro escritório é aceite', async () => {
      const cnpj = uniqueCnpj();
      await create(a.admin, { cnpj, legalName: 'Primeira Ltda' }).expect(201);

      const duplicate = await create(a.analyst, {
        cnpj,
        legalName: 'Repetida Ltda',
      }).expect(409);
      expect(duplicate.body.message).toBe(
        'Já existe uma empresa com este CNPJ no escritório.',
      );

      await create(b.admin, { cnpj, legalName: 'Do Escritório B Ltda' }).expect(
        201,
      );
    });
  });

  describe('GET /companies', () => {
    let tenant: Tenant;

    beforeAll(async () => {
      tenant = await createTenant(app, prisma, 'Empresas Lista');
      for (const name of [
        'Delta Ltda',
        'alfa ltda',
        'Charlie Ltda',
        'Bravo Ltda',
      ]) {
        await createCompany(prisma, tenant.firmId, name);
      }
      await prisma.company.updateMany({
        where: { accountingFirmId: tenant.firmId, legalName: 'Bravo Ltda' },
        data: { tradeName: 'Padaria Bravo' },
      });
    });

    afterAll(async () => {
      await deleteTenants(prisma, [tenant]);
    });

    it('lista só as empresas do escritório, por razão social, paginadas', async () => {
      const first = await list(tenant.viewer, '?pageSize=3').expect(200);
      const second = await list(tenant.viewer, '?pageSize=3&page=2').expect(
        200,
      );

      expect(first.body).toMatchObject({ total: 4, page: 1, pageSize: 3 });
      expect(
        (first.body.items as { legalName: string }[]).map((c) => c.legalName),
      ).toEqual(['alfa ltda', 'Bravo Ltda', 'Charlie Ltda']);
      expect(
        (second.body.items as { legalName: string }[]).map((c) => c.legalName),
      ).toEqual(['Delta Ltda']);
    });

    it('pesquisa por nome sem distinguir maiúsculas, incluindo o nome fantasia', async () => {
      const byLegalName = await list(tenant.viewer, '?search=CHARLIE').expect(
        200,
      );
      const byTradeName = await list(tenant.viewer, '?search=padaria').expect(
        200,
      );

      expect(byLegalName.body.total).toBe(1);
      expect(byLegalName.body.items[0].legalName).toBe('Charlie Ltda');
      expect(byTradeName.body.items[0].legalName).toBe('Bravo Ltda');
    });

    it('pesquisa por parte do CNPJ, com ou sem máscara', async () => {
      const company = await prisma.company.findFirstOrThrow({
        where: { accountingFirmId: tenant.firmId, legalName: 'Delta Ltda' },
      });
      const search = encodeURIComponent(masked(company.cnpj).slice(0, 10));

      const response = await list(tenant.viewer, `?search=${search}`).expect(
        200,
      );

      expect(
        (response.body.items as { id: string }[]).map((c) => c.id),
      ).toEqual([company.id]);
    });

    it('limita o tamanho da página a 100', async () => {
      await list(tenant.viewer, '?pageSize=101').expect(400);
      await list(tenant.viewer, '?page=0').expect(400);
    });

    it('limita a pesquisa a 100 caracteres', async () => {
      await list(tenant.viewer, `?search=${'a'.repeat(100)}`).expect(200);
      await list(tenant.viewer, `?search=${'a'.repeat(101)}`).expect(400);
    });

    it('empresas com a mesma razão social têm ordem estável entre páginas', async () => {
      const twins = await createTenant(app, prisma, 'Empresas Gémeas');
      const ids: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        ids.push((await createCompany(prisma, twins.firmId, 'Igual Ltda')).id);
      }

      const pages = await Promise.all(
        [1, 2, 3].map((page) =>
          list(twins.viewer, `?pageSize=2&page=${page}`).expect(200),
        ),
      );

      expect(
        pages.flatMap((r) =>
          (r.body.items as { id: string }[]).map((c) => c.id),
        ),
      ).toEqual([...ids].sort());
      await deleteTenants(prisma, [twins]);
    });
  });

  describe('GET e PATCH /companies/:id', () => {
    it('VIEWER consulta, mas não altera (403)', async () => {
      const company = await createCompany(prisma, a.firmId, 'Consultada Ltda');

      const response = await api()
        .get(`/api/v1/companies/${company.id}`)
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      expect(response.body.legalName).toBe('Consultada Ltda');

      await update(a.viewer, company.id, { legalName: 'Alterada' }).expect(403);
    });

    it('ANALYST altera os dados e remove o nome fantasia com null', async () => {
      const company = await createCompany(prisma, a.firmId, 'Antiga Ltda');
      await prisma.company.update({
        where: { id: company.id },
        data: { tradeName: 'Antiga' },
      });
      const cnpj = uniqueCnpj();

      const response = await update(a.analyst, company.id, {
        cnpj: masked(cnpj),
        legalName: 'Nova Ltda',
        tradeName: null,
      }).expect(200);

      expect(response.body).toMatchObject({
        cnpj,
        legalName: 'Nova Ltda',
        tradeName: null,
      });
    });

    it('recusa razão social nula ou vazia', async () => {
      const company = await createCompany(prisma, a.firmId);

      await update(a.admin, company.id, { legalName: null }).expect(400);
      await update(a.admin, company.id, { legalName: '   ' }).expect(400);
    });

    it('não permite trocar para um CNPJ já usado no escritório (409)', async () => {
      const first = await createCompany(prisma, a.firmId);
      const second = await createCompany(prisma, a.firmId);

      await update(a.admin, second.id, { cnpj: first.cnpj }).expect(409);
    });

    it('rejeita ID que não é UUID com 400', async () => {
      await update(a.admin, 'nao-e-uuid', { legalName: 'X' }).expect(400);
    });
  });
});
