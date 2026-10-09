import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, TaxRegime } from '../src/generated/prisma/client';
import { createTestApp } from './support/app';
import { createCompany } from './support/companies';
import { createTestPrisma } from './support/prisma';
import {
  type Account,
  createTenant,
  deleteTenants,
  type Tenant,
} from './support/tenants';

const V1_ID = 'f0000000-0000-4000-8000-000000000101';

/** Mês AAAA-MM a `offset` meses do atual (UTC). */
function month(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

interface Profile {
  taxRegime?: TaxRegime | null;
  revenue12m?: string | null;
  payroll12m?: string | null;
  referencePeriod?: string | null;
}

/** Tax Radar (US10, D26, D29, D30): estado calculado no pedido. */
describe('Tax Radar (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;
  const ids: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const radar = (account: Account, query = '') =>
    api().get(`/api/v1/radar${query}`).set('Cookie', account.cookie);

  async function company(
    tenant: Tenant,
    name: string,
    profile: Profile | null,
  ): Promise<void> {
    const created = await createCompany(prisma, tenant.firmId, name);
    ids[name] = created.id;
    if (!profile) return;
    const { referencePeriod = month(-1), ...data } = profile;
    await prisma.taxProfile.create({
      data: {
        accountingFirmId: tenant.firmId,
        companyId: created.id,
        taxRegime: TaxRegime.SIMPLES_NACIONAL,
        revenue12m: '1000000.00',
        payroll12m: '400000.00',
        ...data,
        referencePeriod: referencePeriod
          ? new Date(`${referencePeriod}-01T00:00:00.000Z`)
          : null,
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Radar A');
    b = await createTenant(app, prisma, 'Radar B');

    await company(a, 'Alfa Sem Perfil', null);
    await company(a, 'Beta Incompleta', { revenue12m: null });
    await company(a, 'Gama Antiga', { referencePeriod: '2017-06' });
    await company(a, 'Delta Acima', {
      revenue12m: '5000000.00',
      payroll12m: '1500000.00',
    });
    await company(a, 'Épsilon Velha', {
      payroll12m: '300000.00',
      referencePeriod: month(-14),
    });
    await company(a, 'Zeta Perto', { payroll12m: '260000.00' });
    await company(a, 'Eta Normal', {});
    await company(a, 'Teta Presumido', {
      taxRegime: TaxRegime.LUCRO_PRESUMIDO,
    });
    await company(b, 'Iota de Outro Escritório', { payroll12m: '270000.00' });
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a, b]);
    await prisma.$disconnect();
    await app.close();
  });

  it('exige sessão', async () => {
    await api().get('/api/v1/radar').expect(401);
    await api().get('/api/v1/radar/summary').expect(401);
  });

  it('classifica cada empresa e ordena pela prioridade, depois pelo nome', async () => {
    const response = await radar(a.viewer, '?pageSize=100').expect(200);

    expect(
      (
        response.body.items as {
          company: { legalName: string };
          status: string;
          priorityScore: number;
        }[]
      ).map((i) => [i.company.legalName, i.status, i.priorityScore]),
    ).toEqual([
      ['Épsilon Velha', 'REQUER_ANALISE', 4979],
      ['Delta Acima', 'REQUER_ANALISE', 4000],
      ['Zeta Perto', 'OPORTUNIDADE_PARA_AVALIAR', 3979],
      ['Gama Antiga', 'REVISAR_REGRA', 2000],
      ['Alfa Sem Perfil', 'DADOS_INCOMPLETOS', 1000],
      ['Beta Incompleta', 'DADOS_INCOMPLETOS', 1000],
      ['Eta Normal', 'NORMAL', 879],
      ['Teta Presumido', 'NORMAL', 0],
    ]);
    expect(response.body).toMatchObject({ total: 8, page: 1, pageSize: 100 });
  });

  it('mostra só as empresas do escritório da sessão', async () => {
    const fromA = await radar(a.admin, '?pageSize=100').expect(200);
    const fromB = await radar(b.admin, '?pageSize=100').expect(200);

    const idsOf = (body: unknown) =>
      (body as { items: { company: { id: string } }[] }).items.map(
        (i) => i.company.id,
      );
    expect(idsOf(fromA.body)).not.toContain(ids['Iota de Outro Escritório']);
    expect(idsOf(fromB.body)).toEqual([ids['Iota de Outro Escritório']]);
  });

  it('cada sinal traz os motivos, a versão da regra e o resultado', async () => {
    const response = await radar(a.analyst, '?pageSize=100').expect(200);
    const item = (name: string) =>
      (
        response.body.items as {
          company: { id: string };
          reasons: { code: string }[];
          ruleVersion: unknown;
          result: unknown;
        }[]
      ).find((i) => i.company.id === ids[name]);

    expect(item('Eta Normal')).toMatchObject({
      company: {
        id: ids['Eta Normal'],
        legalName: 'Eta Normal',
        tradeName: null,
      },
      reasons: [{ code: 'FATOR_R_OK' }],
      ruleVersion: {
        id: V1_ID,
        version: 1,
        evaluatorKey: 'SIMPLES_FATOR_R@1',
      },
      result: {
        fatorR: '0.4',
        annex: 'III',
        bracket: 4,
        effectiveRate: '0.1244',
      },
    });
    expect(item('Delta Acima')).toMatchObject({
      reasons: [{ code: 'REVENUE_ABOVE_LIMIT' }],
      result: null,
    });
    expect(item('Épsilon Velha')?.reasons).toEqual([
      expect.objectContaining({ code: 'REFERENCE_OUTDATED' }),
    ]);
    expect(item('Gama Antiga')).toMatchObject({
      reasons: [{ code: 'NO_RULE_VERSION' }],
      ruleVersion: null,
    });
    expect(item('Alfa Sem Perfil')?.reasons).toEqual([
      expect.objectContaining({ code: 'NO_PROFILE' }),
    ]);
    expect(item('Teta Presumido')?.reasons).toEqual([
      expect.objectContaining({ code: 'RULE_NOT_APPLICABLE' }),
    ]);
  });

  it('não expõe campos internos', async () => {
    const response = await radar(a.admin, '?pageSize=1').expect(200);
    const [item] = (response.body as { items: { company: object }[] }).items;

    expect(Object.keys(item).sort()).toEqual([
      'company',
      'lastAnalysis',
      'priorityScore',
      'reasons',
      'result',
      'ruleVersion',
      'status',
    ]);
    expect(Object.keys(item.company).sort()).toEqual([
      'cnpj',
      'id',
      'legalName',
      'tradeName',
    ]);
  });

  it('filtra por estado e pagina', async () => {
    const review = await radar(a.viewer, '?status=REQUER_ANALISE').expect(200);
    const page2 = await radar(a.viewer, '?pageSize=3&page=2').expect(200);

    expect(
      (review.body.items as { company: { legalName: string } }[]).map(
        (i) => i.company.legalName,
      ),
    ).toEqual(['Épsilon Velha', 'Delta Acima']);
    expect(review.body.total).toBe(2);
    expect(
      (page2.body.items as { company: { legalName: string } }[]).map(
        (i) => i.company.legalName,
      ),
    ).toEqual(['Gama Antiga', 'Alfa Sem Perfil', 'Beta Incompleta']);
    expect(page2.body).toMatchObject({ total: 8, page: 2, pageSize: 3 });
  });

  it('recusa estado, página e tamanho inválidos', async () => {
    for (const query of [
      '?status=URGENTE',
      '?pageSize=101',
      '?page=0',
      '?accountingFirmId=x',
    ]) {
      await radar(a.viewer, query).expect(400);
    }
  });

  it('o resumo conta as empresas por estado, só do escritório', async () => {
    const summaryA = await api()
      .get('/api/v1/radar/summary')
      .set('Cookie', a.viewer.cookie)
      .expect(200);
    const summaryB = await api()
      .get('/api/v1/radar/summary')
      .set('Cookie', b.viewer.cookie)
      .expect(200);

    expect(summaryA.body).toEqual({
      total: 8,
      counts: {
        DADOS_INCOMPLETOS: 2,
        REVISAR_REGRA: 1,
        REQUER_ANALISE: 2,
        OPORTUNIDADE_PARA_AVALIAR: 1,
        NORMAL: 2,
      },
    });
    expect(summaryB.body).toEqual({
      total: 1,
      counts: {
        DADOS_INCOMPLETOS: 0,
        REVISAR_REGRA: 0,
        REQUER_ANALISE: 0,
        OPORTUNIDADE_PARA_AVALIAR: 1,
        NORMAL: 0,
      },
    });
  });

  it('o estado acompanha o perfil atual, sem nada gravado (D26)', async () => {
    const before = await radar(a.admin, '?status=OPORTUNIDADE_PARA_AVALIAR');
    expect(before.body.total).toBe(1);

    await api()
      .put(`/api/v1/companies/${ids['Zeta Perto']}/tax-profile`)
      .set('Cookie', a.admin.cookie)
      .send({
        taxRegime: 'SIMPLES_NACIONAL',
        revenue12m: '1000000.00',
        payroll12m: '450000.00',
        referencePeriod: month(-1),
      })
      .expect(200);

    const after = await radar(a.admin, '?status=OPORTUNIDADE_PARA_AVALIAR');
    expect(after.body.total).toBe(0);
  });
});
