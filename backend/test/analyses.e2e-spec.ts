import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, TaxRegime } from '../src/generated/prisma/client';
import { parametersChecksum } from '../src/tax-rules/checksum';
import { evaluate } from '../src/tax-calculations/evaluators';
import type { FatorRInput } from '../src/tax-calculations/evaluation';
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
const RULE_ID = 'f0000000-0000-4000-8000-000000000001';

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

/** Análises do Fator R (US09, US15, D27, D31). */
describe('Análises (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;

  const api = () => request(app.getHttpServer());
  const execute = (account: Account, companyId: string) =>
    api()
      .post(`/api/v1/companies/${companyId}/analyses`)
      .set('Cookie', account.cookie);

  async function company(profile: Profile | null = {}): Promise<string> {
    const created = await createCompany(prisma, a.firmId);
    if (profile) {
      const { referencePeriod = month(-1), ...data } = profile;
      await prisma.taxProfile.create({
        data: {
          accountingFirmId: a.firmId,
          companyId: created.id,
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
          cnae: '6201501',
          revenue12m: '1000000.00',
          payroll12m: '400000.00',
          ...data,
          referencePeriod: referencePeriod
            ? new Date(`${referencePeriod}-01T00:00:00.000Z`)
            : null,
        },
      });
    }
    return created.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Análises A');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a]);
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /companies/:id/analyses', () => {
    it('ANALYST executa: grava a entrada, a versão, o checksum e o raciocínio', async () => {
      const companyId = await company();
      const period = month(-1);

      const { body } = await execute(a.analyst, companyId).expect(201);

      const v1 = await prisma.taxRuleVersion.findUniqueOrThrow({
        where: { id: V1_ID },
      });
      expect(body).toMatchObject({
        companyId,
        status: 'COMPLETED',
        radarStatus: 'NORMAL',
        engineVersion: '1.0.0',
        parametersChecksum: v1.checksum,
        executedBy: { id: a.analyst.id },
        ruleVersion: {
          id: V1_ID,
          ruleCode: 'SIMPLES_FATOR_R',
          version: 1,
          evaluatorKey: 'SIMPLES_FATOR_R@1',
          validFrom: '2018-01-01',
          validUntil: null,
        },
        input: {
          taxRegime: 'SIMPLES_NACIONAL',
          cnae: '6201501',
          revenue12m: '1000000.00',
          payroll12m: '400000.00',
          referencePeriod: period,
        },
        result: {
          fatorR: '0.4',
          annex: 'III',
          bracket: 4,
          nominalRate: '0.16',
          deduction: '35640.00',
          effectiveRate: '0.1244',
        },
      });
      expect(body.ruleVersion.source).toContain('LC 123/2006');
      expect(
        (body.trace.steps as { code: string }[]).map((s) => s.code),
      ).toEqual(['FATOR_R', 'ANEXO', 'FAIXA', 'ALIQUOTA_EFETIVA']);
      expect(body.trace.assumptions).toHaveLength(2);
      expect(body.trace.missing).toEqual([]);
      expect(body.trace.reasons).toEqual([
        expect.objectContaining({ code: 'FATOR_R_OK' }),
      ]);
    });

    it('ADMIN também executa; VIEWER recebe 403 e nada é gravado (D27)', async () => {
      const companyId = await company();

      await execute(a.admin, companyId).expect(201);
      await execute(a.viewer, companyId).expect(403);

      expect(await prisma.analysis.count({ where: { companyId } })).toBe(1);
    });

    it('sem perfil: INCOMPLETE, sem versão, com todos os campos em falta', async () => {
      const companyId = await company(null);

      const { body } = await execute(a.analyst, companyId).expect(201);

      expect(body).toMatchObject({
        status: 'INCOMPLETE',
        radarStatus: 'DADOS_INCOMPLETOS',
        ruleVersion: null,
        parametersChecksum: null,
        result: null,
      });
      expect(body.trace.missing).toEqual([
        'taxRegime',
        'revenue12m',
        'payroll12m',
        'referencePeriod',
      ]);
    });

    it('com dados em falta: INCOMPLETE com a versão do período e o que falta', async () => {
      const companyId = await company({ payroll12m: null });

      const { body } = await execute(a.analyst, companyId).expect(201);

      expect(body).toMatchObject({
        status: 'INCOMPLETE',
        ruleVersion: { id: V1_ID },
        result: null,
        trace: { outcome: { status: 'INCOMPLETE' }, missing: ['payroll12m'] },
      });
    });

    it('RBT12 zero: INCOMPLETE com o motivo, que não tem cálculo (D31)', async () => {
      const companyId = await company({
        revenue12m: '0.00',
        payroll12m: '0.00',
      });

      const { body } = await execute(a.analyst, companyId).expect(201);

      expect(body).toMatchObject({
        status: 'INCOMPLETE',
        radarStatus: 'REQUER_ANALISE',
        result: null,
        trace: {
          outcome: { status: 'NOT_COMPUTABLE', code: 'REVENUE_ZERO' },
          missing: [],
        },
      });
    });

    it('sem versão vigente no mês: INCOMPLETE, com o motivo', async () => {
      const companyId = await company({ referencePeriod: '2017-06' });

      const { body } = await execute(a.analyst, companyId).expect(201);

      expect(body).toMatchObject({
        status: 'INCOMPLETE',
        radarStatus: 'REVISAR_REGRA',
        ruleVersion: null,
        trace: { reasons: [{ code: 'NO_RULE_VERSION' }] },
      });
    });

    it('fora do Simples Nacional: 422 e nada é gravado (D31)', async () => {
      const companyId = await company({
        taxRegime: TaxRegime.LUCRO_PRESUMIDO,
      });

      const { body } = await execute(a.analyst, companyId).expect(422);

      expect(body.message).toBe(
        'O Fator R só se aplica ao Simples Nacional; a empresa está noutro regime.',
      );
      expect(await prisma.analysis.count({ where: { companyId } })).toBe(0);
    });

    it('empresa inexistente: 404', async () => {
      await execute(a.analyst, '00000000-0000-4000-8000-000000000000').expect(
        404,
      );
    });
  });

  describe('imutabilidade e reprodutibilidade (§3.4)', () => {
    it('a análise antiga mantém o resultado depois de o perfil mudar (US15)', async () => {
      const companyId = await company();
      const first = await execute(a.analyst, companyId).expect(201);

      await api()
        .put(`/api/v1/companies/${companyId}/tax-profile`)
        .set('Cookie', a.analyst.cookie)
        .send({
          taxRegime: 'SIMPLES_NACIONAL',
          revenue12m: '1000000.00',
          payroll12m: '100000.00',
          referencePeriod: month(-1),
        })
        .expect(200);
      const second = await execute(a.analyst, companyId).expect(201);
      const old = await api()
        .get(`/api/v1/analyses/${first.body.id}`)
        .set('Cookie', a.viewer.cookie)
        .expect(200);

      expect(old.body.result).toEqual(first.body.result);
      expect(old.body.input).toEqual(first.body.input);
      expect(second.body.result.annex).toBe('V');
    });

    it('replay: a entrada gravada com a versão gravada dá o mesmo resultado', async () => {
      const companyId = await company({ payroll12m: '271234.56' });
      const { body } = await execute(a.analyst, companyId).expect(201);

      const stored = await prisma.analysis.findUniqueOrThrow({
        where: { id: body.id as string },
        include: { taxRuleVersion: true },
      });
      const version = stored.taxRuleVersion!;
      expect(parametersChecksum(version.parameters)).toBe(
        stored.parametersChecksum,
      );
      const replay = evaluate(
        version,
        stored.inputSnapshot as unknown as FatorRInput,
      );

      expect(replay.status).toBe('COMPLETED');
      expect('result' in replay && replay.result).toEqual(stored.result);
      expect(replay.trace).toEqual((stored.trace as { steps: unknown }).steps);
    });

    it('o banco recusa alterar uma análise', async () => {
      const companyId = await company();
      const { body } = await execute(a.analyst, companyId).expect(201);

      await expect(
        prisma.analysis.update({
          where: { id: body.id as string },
          data: { radarStatus: 'NORMAL', result: { annex: 'V' } },
        }),
      ).rejects.toThrow(/uma análise é imutável/);
    });

    it('o banco recusa um checksum que não é o da versão usada', async () => {
      const companyId = await company();

      await expect(
        prisma.analysis.create({
          data: {
            accountingFirmId: a.firmId,
            companyId,
            executedById: a.analyst.id,
            taxRuleVersionId: V1_ID,
            parametersChecksum: '0'.repeat(64),
            engineVersion: '1.0.0',
            inputSnapshot: {},
            status: 'COMPLETED',
            radarStatus: 'NORMAL',
            result: {},
            trace: {},
          },
        }),
      ).rejects.toThrow(/o checksum não é o da versão da regra usada/);
    });

    it.each([
      ['COMPLETED sem resultado', { status: 'COMPLETED' as const }],
      [
        'INCOMPLETE com resultado',
        { status: 'INCOMPLETE' as const, result: { annex: 'III' } },
      ],
    ])('o banco recusa %s', async (_case, data) => {
      const companyId = await company();
      const v1 = await prisma.taxRuleVersion.findUniqueOrThrow({
        where: { id: V1_ID },
      });

      await expect(
        prisma.analysis.create({
          data: {
            accountingFirmId: a.firmId,
            companyId,
            executedById: a.analyst.id,
            taxRuleVersionId: V1_ID,
            parametersChecksum: v1.checksum,
            engineVersion: '1.0.0',
            inputSnapshot: {},
            radarStatus: 'NORMAL',
            trace: {},
            ...data,
          },
        }),
      ).rejects.toThrow(/analyses_status_content_check/);
    });
  });

  describe('restrições do banco', () => {
    it.each([
      [
        'checksum sem versão',
        { parametersChecksum: 'a'.repeat(64) },
        'analyses_version_checksum_check',
      ],
      [
        'versão do engine fora do formato',
        { engineVersion: 'v1' },
        'analyses_engine_version_format_check',
      ],
      [
        'entrada que não é objeto',
        { inputSnapshot: ['x'] },
        'analyses_json_objects_check',
      ],
      ['trace que não é objeto', { trace: 'x' }, 'analyses_json_objects_check'],
    ])('recusa %s', async (_case, data, constraint) => {
      const companyId = await company();

      await expect(
        prisma.analysis.create({
          data: {
            accountingFirmId: a.firmId,
            companyId,
            executedById: a.analyst.id,
            engineVersion: '1.0.0',
            inputSnapshot: {},
            status: 'INCOMPLETE',
            radarStatus: 'DADOS_INCOMPLETOS',
            trace: {},
            ...data,
          },
        }),
      ).rejects.toThrow(new RegExp(constraint));
    });

    it('recusa um checksum fora do formato', async () => {
      // Sem versão: com versão, o trigger recusa antes, por não ser o checksum
      // da versão. Os CHECK correm por ordem alfabética do nome.
      const companyId = await company();

      await expect(
        prisma.analysis.create({
          data: {
            accountingFirmId: a.firmId,
            companyId,
            executedById: a.analyst.id,
            parametersChecksum: 'X'.repeat(64),
            engineVersion: '1.0.0',
            inputSnapshot: {},
            status: 'INCOMPLETE',
            radarStatus: 'DADOS_INCOMPLETOS',
            trace: {},
          },
        }),
      ).rejects.toThrow(/analyses_parameters_checksum_format_check/);
    });
  });

  describe('consulta (US15)', () => {
    it('lista o histórico da empresa, mais recente primeiro, paginado', async () => {
      const companyId = await company();
      const other = await company();
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          (await execute(a.analyst, companyId).expect(201)).body.id as string,
        );
      }
      await execute(a.analyst, other).expect(201);

      const page1 = await api()
        .get(`/api/v1/companies/${companyId}/analyses?pageSize=2`)
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      const page2 = await api()
        .get(`/api/v1/companies/${companyId}/analyses?pageSize=2&page=2`)
        .set('Cookie', a.viewer.cookie)
        .expect(200);

      expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(
        [...page1.body.items, ...page2.body.items].map(
          (i: { id: string }) => i.id,
        ),
      ).toEqual([...ids].reverse());
      expect(page1.body.items[0]).not.toHaveProperty('trace');
      expect(page1.body.items[0]).not.toHaveProperty('input');
    });

    it('VIEWER consulta o detalhe; um id inexistente responde 404', async () => {
      const companyId = await company();
      const { body } = await execute(a.analyst, companyId).expect(201);

      const detail = await api()
        .get(`/api/v1/analyses/${body.id}`)
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      expect(detail.body).toEqual(body);

      await api()
        .get('/api/v1/analyses/00000000-0000-4000-8000-000000000000')
        .set('Cookie', a.viewer.cookie)
        .expect(404);
    });

    it('recusa ids que não são UUID e páginas inválidas', async () => {
      await api()
        .get('/api/v1/analyses/nao-e-uuid')
        .set('Cookie', a.viewer.cookie)
        .expect(400);
      const companyId = await company();
      await api()
        .get(`/api/v1/companies/${companyId}/analyses?pageSize=101`)
        .set('Cookie', a.viewer.cookie)
        .expect(400);
    });
  });

  describe('ligação ao Tax Radar (D26, D29)', () => {
    const radarItem = async (companyId: string) => {
      const { body } = await api()
        .get('/api/v1/radar?pageSize=100')
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      return (
        body.items as {
          company: { id: string };
          status: string;
          reasons: { code: string }[];
          lastAnalysis: { id: string } | null;
        }[]
      ).find((i) => i.company.id === companyId);
    };

    it('o Radar mostra a última análise da empresa', async () => {
      const companyId = await company();
      expect((await radarItem(companyId))?.lastAnalysis).toBeNull();

      await execute(a.analyst, companyId).expect(201);
      const { body } = await execute(a.analyst, companyId).expect(201);

      expect((await radarItem(companyId))?.lastAnalysis).toMatchObject({
        id: body.id,
        status: 'COMPLETED',
      });
    });

    it('última análise feita com outra versão: REVISAR_REGRA', async () => {
      const companyId = await company();
      // Versão em rascunho: pode ser apagada no fim do teste.
      const parameters = { threshold: '0.28' };
      const draft = await prisma.taxRuleVersion.create({
        data: {
          taxRuleId: RULE_ID,
          version: 99,
          validFrom: new Date('2018-01-01'),
          parameters,
          source: 'Versão de teste',
          evaluatorKey: 'SIMPLES_FATOR_R@1',
          status: 'DRAFT',
          checksum: parametersChecksum(parameters),
        },
      });
      try {
        await prisma.analysis.create({
          data: {
            accountingFirmId: a.firmId,
            companyId,
            executedById: a.analyst.id,
            taxRuleVersionId: draft.id,
            parametersChecksum: draft.checksum,
            engineVersion: '1.0.0',
            inputSnapshot: {},
            status: 'INCOMPLETE',
            radarStatus: 'NORMAL',
            trace: {},
          },
        });

        const item = await radarItem(companyId);
        expect(item?.status).toBe('REVISAR_REGRA');
        expect(item?.reasons).toEqual([
          expect.objectContaining({ code: 'ANALYSIS_RULE_OUTDATED' }),
        ]);

        // Uma análise nova, com a versão vigente, resolve o sinal.
        await execute(a.analyst, companyId).expect(201);
        expect((await radarItem(companyId))?.status).toBe('NORMAL');
      } finally {
        await prisma.analysis.deleteMany({
          where: { taxRuleVersionId: draft.id },
        });
        await prisma.taxRuleVersion.delete({ where: { id: draft.id } });
      }
    });
  });
});
