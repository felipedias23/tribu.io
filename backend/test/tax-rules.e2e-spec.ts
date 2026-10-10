import {
  Prisma,
  PrismaClient,
  TaxRuleVersionStatus,
} from '../src/generated/prisma/client';
import { parametersChecksum } from '../src/tax-rules/checksum';
import {
  fatorRParametersSchema,
  SIMPLES_FATOR_R_CODE,
  SIMPLES_FATOR_R_EVALUATOR,
} from '../src/tax-rules/simples-fator-r.parameters';
import { FATOR_R_V1 } from '../src/tax-calculations/simples-fator-r-v1.fixture';
import { createTestPrisma } from './support/prisma';

const { DRAFT, PUBLISHED, SUPERSEDED } = TaxRuleVersionStatus;
const V1_ID = 'f0000000-0000-4000-8000-000000000101';

/** Tabela da §3.4.1 (LC 123/2006, Anexos III e V): [até, alíquota, parcela]. */
// prettier-ignore
const LAW_TABLE = {
  III: [
    ['180000.00', '0.06', '0.00'], ['360000.00', '0.112', '9360.00'],
    ['720000.00', '0.135', '17640.00'], ['1800000.00', '0.16', '35640.00'],
    ['3600000.00', '0.21', '125640.00'], ['4800000.00', '0.33', '648000.00'],
  ],
  V: [
    ['180000.00', '0.155', '0.00'], ['360000.00', '0.18', '4500.00'],
    ['720000.00', '0.195', '9900.00'], ['1800000.00', '0.205', '17100.00'],
    ['3600000.00', '0.23', '62100.00'], ['4800000.00', '0.305', '540000.00'],
  ],
};

class Rollback extends Error {}

/** Catálogo de regras tributárias (§3.4, D28): dados da versão 1 e restrições. */
describe('Regras tributárias (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Corre `fn` numa transação desfeita no fim: as versões publicadas não
   * podem ser apagadas, por isso os testes não deixam dados.
   */
  async function inRollback(
    fn: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  async function createRule(tx: Prisma.TransactionClient) {
    return tx.taxRule.create({
      data: { code: 'TESTE_E2E', name: 'Regra de teste', description: '-' },
    });
  }

  function version(
    taxRuleId: string,
    data: Partial<Prisma.TaxRuleVersionUncheckedCreateInput> = {},
  ): Prisma.TaxRuleVersionUncheckedCreateInput {
    return {
      taxRuleId,
      version: 1,
      validFrom: new Date('2020-01-01'),
      validUntil: null,
      parameters: { a: '1' },
      source: 'Fonte de teste',
      evaluatorKey: 'TESTE_E2E@1',
      status: PUBLISHED,
      checksum: parametersChecksum({ a: '1' }),
      ...data,
    };
  }

  describe('versão 1 do Fator R (migration)', () => {
    it('está publicada, em vigor desde 2018 e sem fim', async () => {
      const rule = await prisma.taxRule.findUniqueOrThrow({
        where: { code: SIMPLES_FATOR_R_CODE },
        include: { versions: true },
      });

      expect(rule.versions).toHaveLength(1);
      expect(rule.versions[0]).toMatchObject({
        id: V1_ID,
        version: 1,
        status: PUBLISHED,
        evaluatorKey: SIMPLES_FATOR_R_EVALUATOR,
        validFrom: new Date('2018-01-01'),
        validUntil: null,
      });
    });

    it('tem parâmetros válidos, iguais à tabela da lei, com o checksum certo', async () => {
      const v1 = await prisma.taxRuleVersion.findUniqueOrThrow({
        where: { id: V1_ID },
      });
      const parameters = fatorRParametersSchema.parse(v1.parameters);

      expect(v1.checksum).toBe(parametersChecksum(v1.parameters));
      // A fixture dos testes unitários do Tax Engine é igual ao banco.
      expect(v1.parameters).toEqual(FATOR_R_V1);
      expect(parameters).toMatchObject({
        threshold: '0.28',
        opportunityMargin: '0.03',
        maxReferenceAgeMonths: 12,
        revenueLimit: '4800000.00',
      });
      for (const annex of ['III', 'V'] as const) {
        expect(
          parameters.annexes[annex].map((b) => [
            b.upTo,
            b.nominalRate,
            b.deduction,
          ]),
        ).toEqual(LAW_TABLE[annex]);
      }
    });
  });

  describe('vigência das versões publicadas', () => {
    it('recusa duas versões publicadas com vigências sobrepostas', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await tx.taxRuleVersion.create({ data: version(rule.id) });

        await expect(
          tx.taxRuleVersion.create({
            data: version(rule.id, {
              version: 2,
              validFrom: new Date('2024-06-01'),
            }),
          }),
        ).rejects.toThrow(/tax_rule_versions_published_no_overlap/);
      });
    });

    it('aceita versões publicadas seguidas: o fim é exclusivo', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await tx.taxRuleVersion.create({
          data: version(rule.id, { validUntil: new Date('2024-01-01') }),
        });
        await tx.taxRuleVersion.create({
          data: version(rule.id, {
            version: 2,
            validFrom: new Date('2024-01-01'),
          }),
        });
      });
    });

    it('aceita rascunhos e versões substituídas sobrepostas a uma publicada', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await tx.taxRuleVersion.create({ data: version(rule.id) });
        await tx.taxRuleVersion.create({
          data: version(rule.id, { version: 2, status: DRAFT }),
        });
        await tx.taxRuleVersion.create({
          data: version(rule.id, { version: 3, status: SUPERSEDED }),
        });
      });
    });

    it('a mesma vigência pode ser publicada noutra regra', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await tx.taxRuleVersion.create({
          data: version(rule.id, { validFrom: new Date('2018-01-01') }),
        });
      });
    });
  });

  describe('restrições de cada versão', () => {
    it.each([
      [
        'fim igual ao início',
        { validUntil: new Date('2020-01-01') },
        'tax_rule_versions_validity_check',
      ],
      [
        'fim antes do início',
        { validUntil: new Date('2019-12-31') },
        'tax_rule_versions_validity_check',
      ],
      ['versão 0', { version: 0 }, 'tax_rule_versions_version_positive_check'],
      [
        'parâmetros que não são objeto',
        { parameters: ['1'] },
        'tax_rule_versions_parameters_object_check',
      ],
      [
        'checksum fora do formato',
        { checksum: 'X'.repeat(64) },
        'tax_rule_versions_checksum_format_check',
      ],
      [
        'evaluator sem versão',
        { evaluatorKey: 'TESTE_E2E' },
        'tax_rule_versions_evaluator_key_format_check',
      ],
      [
        'fonte em branco',
        { source: '  ' },
        'tax_rule_versions_source_not_blank_check',
      ],
    ])('recusa %s', async (_case, data, constraint) => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await expect(
          tx.taxRuleVersion.create({ data: version(rule.id, data) }),
        ).rejects.toThrow(new RegExp(constraint));
      });
    });

    it('recusa o mesmo número de versão na mesma regra', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        await tx.taxRuleVersion.create({
          data: version(rule.id, { status: DRAFT }),
        });
        await expect(
          tx.taxRuleVersion.create({
            data: version(rule.id, { status: DRAFT }),
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });
    });

    it('recusa um código de regra fora do formato', async () => {
      await inRollback(async (tx) => {
        await expect(
          tx.taxRule.create({
            data: { code: 'fator r', name: 'X', description: '-' },
          }),
        ).rejects.toThrow(/tax_rules_code_format_check/);
      });
    });
  });

  describe('imutabilidade das versões publicadas', () => {
    const IMMUTABLE = /imutável; publique uma versão nova/;

    it.each([
      ['os parâmetros', { parameters: { threshold: '0.30' } }],
      ['o checksum', { checksum: '0'.repeat(64) }],
      ['o início da vigência', { validFrom: new Date('2019-01-01') }],
      ['a fonte', { source: 'Outra fonte' }],
      ['o evaluator', { evaluatorKey: 'SIMPLES_FATOR_R@2' }],
      ['o número da versão', { version: 9 }],
      ['o estado para rascunho', { status: DRAFT }],
    ])('recusa alterar %s da versão 1', async (_case, data) => {
      await inRollback(async (tx) => {
        await expect(
          tx.taxRuleVersion.update({ where: { id: V1_ID }, data }),
        ).rejects.toThrow(IMMUTABLE);
      });
    });

    it('aceita fechar a vigência e marcar como substituída', async () => {
      await inRollback(async (tx) => {
        await tx.taxRuleVersion.update({
          where: { id: V1_ID },
          data: { validUntil: new Date('2027-01-01') },
        });
        await tx.taxRuleVersion.update({
          where: { id: V1_ID },
          data: { status: SUPERSEDED },
        });
      });
    });

    it('recusa mudar uma vigência já fechada', async () => {
      await inRollback(async (tx) => {
        await tx.taxRuleVersion.update({
          where: { id: V1_ID },
          data: { validUntil: new Date('2027-01-01') },
        });
        await expect(
          tx.taxRuleVersion.update({
            where: { id: V1_ID },
            data: { validUntil: new Date('2028-01-01') },
          }),
        ).rejects.toThrow(IMMUTABLE);
      });
    });

    it('recusa voltar a publicar uma versão substituída', async () => {
      await inRollback(async (tx) => {
        await tx.taxRuleVersion.update({
          where: { id: V1_ID },
          data: { status: SUPERSEDED },
        });
        await expect(
          tx.taxRuleVersion.update({
            where: { id: V1_ID },
            data: { status: PUBLISHED },
          }),
        ).rejects.toThrow(IMMUTABLE);
      });
    });

    it('recusa apagar uma versão publicada', async () => {
      await inRollback(async (tx) => {
        await expect(
          tx.taxRuleVersion.delete({ where: { id: V1_ID } }),
        ).rejects.toThrow(/não pode ser apagada/);
      });
    });

    it('um rascunho pode ser alterado e apagado', async () => {
      await inRollback(async (tx) => {
        const rule = await createRule(tx);
        const draft = await tx.taxRuleVersion.create({
          data: version(rule.id, { status: DRAFT }),
        });
        await tx.taxRuleVersion.update({
          where: { id: draft.id },
          data: { parameters: { a: '2' }, source: 'Outra fonte' },
        });
        await tx.taxRuleVersion.delete({ where: { id: draft.id } });
      });
    });
  });
});
