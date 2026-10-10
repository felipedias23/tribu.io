import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const HEADER =
  'cnpj;razao_social;nome_fantasia;id_externo;regime;receita_12m;folha_12m;mes_referencia;sujeita_fator_r;obs';

let ip = 0;

/** Importação por ficheiro (US12, US13, D34–D38). */
describe('Importação (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let a: Tenant;
  let b: Tenant;

  const api = () => request(app.getHttpServer());

  /** Cada envio vem de um IP próprio, para não esbarrar no rate limit. */
  function upload(
    account: Account,
    content: string | Buffer,
    fileName = 'carteira.csv',
    origin?: string,
  ) {
    ip += 1;
    return api()
      .post('/api/v1/imports')
      .set('Cookie', account.cookie)
      .set('X-Forwarded-For', `198.51.100.${ip % 250}`)
      .send({
        fileName,
        contentBase64: Buffer.from(content).toString('base64'),
        ...(origin && { origin }),
      });
  }

  const confirm = (account: Account, id: string) =>
    api().post(`/api/v1/imports/${id}/confirm`).set('Cookie', account.cookie);
  const cancel = (account: Account, id: string) =>
    api().post(`/api/v1/imports/${id}/cancel`).set('Cookie', account.cookie);
  const detail = (account: Account, id: string) =>
    api().get(`/api/v1/imports/${id}`).set('Cookie', account.cookie);

  const companiesOf = (tenant: Tenant) =>
    prisma.company.count({ where: { accountingFirmId: tenant.firmId } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
    a = await createTenant(app, prisma, 'Importação API A');
    b = await createTenant(app, prisma, 'Importação API B');
  });

  afterAll(async () => {
    await deleteTenants(prisma, [a, b]);
    await prisma.$disconnect();
    await app.close();
  });

  describe('prévia (POST /imports)', () => {
    it('classifica as linhas sem gravar nada na carteira (D36, D37)', async () => {
      const existing = await createCompany(prisma, a.firmId, 'Existente Ltda');
      const nova = uniqueCnpj();
      const before = await companiesOf(a);
      const csv = [
        HEADER,
        `${nova};Nova Ltda;Nova;E-1;Simples Nacional;1.000.000,00;300.000,00;09/2026;sim;x`,
        `${existing.cnpj};Existente Ltda;;;;;;;;`,
        `${existing.cnpj.slice(0, 13)}${(Number(existing.cnpj[13]) + 1) % 10};Inválida;;;;;;;;`,
      ].join('\n');

      const { body } = await upload(a.analyst, csv).expect(201);

      expect(body).toMatchObject({
        status: 'PREVIEW',
        fileName: 'carteira.csv',
        fileFormat: 'CSV',
        origin: 'Importação de ficheiros',
        createdBy: { id: a.analyst.id },
        closedAt: null,
        closedBy: null,
        summary: {
          total: 3,
          new: 1,
          unchanged: 1,
          error: 1,
          ignoredColumns: ['obs'],
        },
      });
      expect(
        (body.rows as { line: number; outcome: string }[]).map((r) => [
          r.line,
          r.outcome,
        ]),
      ).toEqual([
        [2, 'NEW'],
        [3, 'UNCHANGED'],
        [4, 'ERROR'],
      ]);
      expect(body.rows[0]).not.toHaveProperty('values');
      const hours =
        (Date.parse(body.expiresAt as string) -
          Date.parse(body.createdAt as string)) /
        3_600_000;
      expect(hours).toBe(24);
      expect(await companiesOf(a)).toBe(before);
    });

    it('lê o XLSX gravado pelo LibreOffice', async () => {
      const xlsx = readFileSync(
        join(__dirname, 'fixtures/imports/carteira-libreoffice.xlsx'),
      );

      const { body } = await upload(a.analyst, xlsx, 'carteira.xlsx').expect(
        201,
      );

      expect(body.fileFormat).toBe('XLSX');
      expect(body.summary).toMatchObject({ total: 4, error: 2 });
    });

    it('ficheiro inválido: 422 com a mensagem do problema', async () => {
      const { body } = await upload(a.analyst, 'nome;outra\n1;2').expect(422);

      expect(body.message).toMatch(/Faltam as colunas obrigatórias/);
    });

    it('recusa base64 inválido, nome em falta e campos fora do contrato', async () => {
      for (const send of [
        { fileName: 'a.csv', contentBase64: 'não é base64!' },
        { contentBase64: 'YQ==' },
        {
          fileName: 'a.csv',
          contentBase64: 'YQ==',
          accountingFirmId: b.firmId,
        },
      ]) {
        await api()
          .post('/api/v1/imports')
          .set('Cookie', a.analyst.cookie)
          .set('X-Forwarded-For', `203.0.113.${(ip += 1) % 250}`)
          .send(send)
          .expect(400);
      }
    });

    it('ficheiro acima de 2 MB: 400; corpo acima de 3 MB: 413 no formato da API', async () => {
      const over = await upload(a.analyst, Buffer.alloc(2_100_000, 'a')).expect(
        400,
      );
      expect(over.body.details[0].field).toBe('contentBase64');

      const tooLarge = await api()
        .post('/api/v1/imports')
        .set('Cookie', a.analyst.cookie)
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            fileName: 'a.csv',
            contentBase64: 'a'.repeat(3_200_000),
          }),
        )
        .expect(413);
      expect(tooLarge.body).toMatchObject({
        statusCode: 413,
        message: 'O pedido excede o tamanho máximo permitido.',
      });
    });

    it('as outras rotas mantêm o limite de 100 KB', async () => {
      await api()
        .post('/api/v1/companies')
        .set('Cookie', a.analyst.cookie)
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            cnpj: uniqueCnpj(),
            legalName: 'x'.repeat(200_000),
          }),
        )
        .expect(413);
    });

    it('VIEWER não importa, mas consulta (D34)', async () => {
      await upload(a.viewer, HEADER).expect(403);
      const { body } = await upload(
        a.admin,
        `${HEADER}\n${uniqueCnpj()};V Ltda;;;;;;;;`,
      ).expect(201);

      await detail(a.viewer, body.id as string).expect(200);
      await api()
        .get('/api/v1/imports')
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      await confirm(a.viewer, body.id as string).expect(403);
      await cancel(a.viewer, body.id as string).expect(403);
    });

    it('o mesmo CNPJ de outro escritório não é reconhecido: é uma empresa nova', async () => {
      const foreign = await createCompany(prisma, b.firmId, 'De B Ltda');

      const { body } = await upload(
        a.analyst,
        `${HEADER}\n${foreign.cnpj};De B Ltda;;;;;;;;`,
      ).expect(201);

      expect(body.rows[0]).toMatchObject({ outcome: 'NEW', companyId: null });
    });

    it('limita os envios: 11.º do mesmo IP no mesmo minuto recebe 429', async () => {
      const send = () =>
        api()
          .post('/api/v1/imports')
          .set('Cookie', a.analyst.cookie)
          .set('X-Forwarded-For', '192.0.2.250')
          .send({ fileName: 'a.csv', contentBase64: 'YQ==' });
      for (let i = 0; i < 10; i += 1) await send().expect(422);
      await send().expect(429);
    });
  });

  describe('confirmação (POST /imports/:id/confirm)', () => {
    it('aplica novas e atualizadas; célula vazia não apaga; conflitos e erros ficam de fora', async () => {
      const kept = await createCompany(prisma, a.firmId, 'Mantida Ltda');
      await prisma.taxProfile.create({
        data: {
          accountingFirmId: a.firmId,
          companyId: kept.id,
          taxRegime: 'SIMPLES_NACIONAL',
          revenue12m: '500000.00',
          payroll12m: '150000.00',
          fatorRSubject: true,
        },
      });
      const nova = uniqueCnpj();
      const repeated = uniqueCnpj();
      const csv = [
        HEADER,
        `${nova};Criada Ltda;Criada;C-1;Simples Nacional;1.000.000,00;300.000,00;09/2026;sim;`,
        `${kept.cnpj};Mantida S.A.;;M-1;;;200.000,00;;;`,
        `${repeated};Repetida 1;;;;;;;;`,
        `${repeated};Repetida 2;;;;;;;;`,
        `${uniqueCnpj()};Com erro;;;Regime X;;;;;`,
      ].join('\n');
      const preview = await upload(
        a.analyst,
        csv,
        'carteira.csv',
        'Sistema X',
      ).expect(201);
      expect(preview.body.summary).toMatchObject({
        new: 1,
        updated: 1,
        conflict: 2,
        error: 1,
      });

      const { body } = await confirm(
        a.analyst,
        preview.body.id as string,
      ).expect(200);

      expect(body).toMatchObject({
        status: 'CONFIRMED',
        rows: null,
        origin: 'Sistema X',
        closedBy: { id: a.analyst.id },
      });
      const created = await prisma.company.findFirstOrThrow({
        where: { accountingFirmId: a.firmId, cnpj: nova },
        include: { taxProfile: true, externalIds: true },
      });
      expect(created).toMatchObject({
        legalName: 'Criada Ltda',
        tradeName: 'Criada',
      });
      expect(created.taxProfile).toMatchObject({
        taxRegime: 'SIMPLES_NACIONAL',
        fatorRSubject: true,
        referencePeriod: new Date('2026-09-01'),
      });
      expect(created.taxProfile?.revenue12m?.toFixed(2)).toBe('1000000.00');
      expect(created.taxProfile?.city).toBeNull();
      expect(created.externalIds.map((e) => e.externalId)).toEqual(['C-1']);

      const updated = await prisma.company.findUniqueOrThrow({
        where: { id: kept.id },
        include: { taxProfile: true, externalIds: true },
      });
      expect(updated.legalName).toBe('Mantida S.A.');
      expect(updated.taxProfile?.payroll12m?.toFixed(2)).toBe('200000.00');
      // Células vazias não apagaram o que já estava gravado (D34).
      expect(updated.taxProfile?.revenue12m?.toFixed(2)).toBe('500000.00');
      expect(updated.taxProfile?.fatorRSubject).toBe(true);
      expect(updated.externalIds.map((e) => e.externalId)).toEqual(['M-1']);

      expect(
        await prisma.company.count({
          where: { accountingFirmId: a.firmId, cnpj: repeated },
        }),
      ).toBe(0);
      await confirm(a.analyst, preview.body.id as string).expect(409);
    });

    it('o id externo reconhece a empresa numa importação seguinte da mesma origem', async () => {
      const cnpj = uniqueCnpj();
      const first = await upload(
        a.analyst,
        `${HEADER}\n${cnpj};Primeira Ltda;;R-9;;;;;;`,
        'a.csv',
        'Origem R',
      ).expect(201);
      await confirm(a.analyst, first.body.id as string).expect(200);

      const second = await upload(
        a.analyst,
        `${HEADER}\n${uniqueCnpj()};Outra Ltda;;R-9;;;;;;`,
        'a.csv',
        'Origem R',
      ).expect(201);

      expect(second.body.rows[0]).toMatchObject({
        outcome: 'CONFLICT',
        reason: expect.stringContaining(
          'O id externo R-9 é de "Primeira Ltda"',
        ),
      });
    });

    it('se a carteira mudou desde a prévia, responde 409 e não aplica nada (D37)', async () => {
      const cnpj = uniqueCnpj();
      const other = uniqueCnpj();
      const preview = await upload(
        a.analyst,
        `${HEADER}\n${cnpj};Corrida Ltda;;;;;;;;\n${other};Outra Corrida Ltda;;;;;;;;`,
      ).expect(201);
      await prisma.company.create({
        data: {
          accountingFirmId: a.firmId,
          cnpj,
          legalName: 'Criada entretanto',
        },
      });

      const { body } = await confirm(
        a.analyst,
        preview.body.id as string,
      ).expect(409);

      expect(body.message).toMatch(/A carteira mudou desde a prévia/);
      expect(
        await prisma.company.count({
          where: { accountingFirmId: a.firmId, cnpj: other },
        }),
      ).toBe(0);
      expect(
        (await detail(a.analyst, preview.body.id as string)).body.status,
      ).toBe('PREVIEW');
    });
  });

  describe('cancelamento e expiração', () => {
    it('cancelar fecha a prévia, apaga as linhas e não deixa confirmar', async () => {
      const preview = await upload(
        a.analyst,
        `${HEADER}\n${uniqueCnpj()};C Ltda;;;;;;;;`,
      ).expect(201);
      const id = preview.body.id as string;

      const { body } = await cancel(a.analyst, id).expect(200);

      expect(body).toMatchObject({ status: 'CANCELLED', rows: null });
      expect(body.summary.new).toBe(1);
      await confirm(a.analyst, id).expect(409);
      await cancel(a.analyst, id).expect(409);
    });

    it('uma prévia com mais de 24 horas expira e não pode ser confirmada', async () => {
      const preview = await upload(
        a.analyst,
        `${HEADER}\n${uniqueCnpj()};E Ltda;;;;;;;;`,
      ).expect(201);
      const id = preview.body.id as string;
      const past = Date.now() - 25 * 3_600_000;
      await prisma.importBatch.update({
        where: { id },
        data: {
          createdAt: new Date(past),
          expiresAt: new Date(past + 24 * 3_600_000),
        },
      });

      const { body } = await detail(a.viewer, id).expect(200);
      expect(body).toMatchObject({ status: 'EXPIRED', rows: null });
      expect(body.closedAt).not.toBeNull();

      const refused = await confirm(a.analyst, id).expect(409);
      expect(refused.body.message).toMatch(/A prévia expirou/);
    });
  });

  describe('histórico (GET /imports)', () => {
    it('lista as importações do escritório, mais recentes primeiro, sem as linhas', async () => {
      const { body } = await api()
        .get('/api/v1/imports?pageSize=100')
        .set('Cookie', a.viewer.cookie)
        .expect(200);
      const fromB = await api()
        .get('/api/v1/imports')
        .set('Cookie', b.viewer.cookie)
        .expect(200);

      expect(body.total).toBeGreaterThan(5);
      expect(body.items[0]).not.toHaveProperty('rows');
      const dates = (body.items as { createdAt: string }[]).map((i) =>
        Date.parse(i.createdAt),
      );
      expect([...dates].sort((x, y) => y - x)).toEqual(dates);
      expect(fromB.body.total).toBe(0);
    });
  });
});
