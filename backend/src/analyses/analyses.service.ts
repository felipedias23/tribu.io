import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser, TenantId } from '../auth/authenticated-user';
import { CompaniesService } from '../companies/companies.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { classify } from '../radar/radar-classifier';
import {
  ENGINE_VERSION,
  type FatorRInput,
  missingFields,
} from '../tax-calculations/evaluation';
import { evaluate } from '../tax-calculations/evaluators';
import {
  currentPeriod,
  PROFILE_INPUT_SELECT,
  toFatorRInput,
} from '../tax-calculations/profile-input';
import { selectVersion } from '../tax-calculations/rule-version-selection';
import { SIMPLES_FATOR_R_CODE } from '../tax-rules/simples-fator-r.parameters';
import { TaxRulesService } from '../tax-rules/tax-rules.service';
import type {
  AnalysisPageResponse,
  AnalysisResponse,
  AnalysisSummaryResponse,
} from './dto/analysis.response';
import type { ListAnalysesQuery } from './dto/list-analyses.query';

const SUMMARY_SELECT = {
  id: true,
  companyId: true,
  status: true,
  radarStatus: true,
  executedAt: true,
  result: true,
  executedBy: { select: { id: true, name: true } },
  taxRuleVersion: {
    select: {
      id: true,
      version: true,
      evaluatorKey: true,
      validFrom: true,
      validUntil: true,
      source: true,
      taxRule: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.AnalysisSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  engineVersion: true,
  parametersChecksum: true,
  inputSnapshot: true,
  trace: true,
} satisfies Prisma.AnalysisSelect;

type SummaryRow = Prisma.AnalysisGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.AnalysisGetPayload<{ select: typeof DETAIL_SELECT }>;

/** Perfil inexistente: todos os campos em falta. */
const EMPTY_INPUT: FatorRInput = {
  taxRegime: null,
  cnae: null,
  revenue12m: null,
  payroll12m: null,
  referencePeriod: null,
};

const NOT_FOUND = 'Análise não encontrada.';
const day = (date: Date) => date.toISOString().slice(0, 10);

function toSummary(row: SummaryRow): AnalysisSummaryResponse {
  const version = row.taxRuleVersion;
  return {
    id: row.id,
    companyId: row.companyId,
    status: row.status,
    radarStatus: row.radarStatus,
    executedAt: row.executedAt,
    executedBy: row.executedBy,
    ruleVersion: version
      ? {
          id: version.id,
          ruleCode: version.taxRule.code,
          ruleName: version.taxRule.name,
          version: version.version,
          evaluatorKey: version.evaluatorKey,
          validFrom: day(version.validFrom),
          validUntil: version.validUntil ? day(version.validUntil) : null,
          source: version.source,
        }
      : null,
    result: row.result,
  };
}

function toDetail(row: DetailRow): AnalysisResponse {
  return {
    ...toSummary(row),
    engineVersion: row.engineVersion,
    parametersChecksum: row.parametersChecksum,
    input: row.inputSnapshot,
    trace: row.trace,
  };
}

/**
 * Análises do Fator R (US09). Cada execução grava um registo imutável com a
 * entrada, a versão da regra, o checksum e o raciocínio (§3.4). Uma análise
 * que não chega a calcular fica INCOMPLETE com o motivo; fora do Simples
 * Nacional a regra não se aplica e nada é gravado (D31).
 */
@Injectable()
export class AnalysesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly taxRules: TaxRulesService,
  ) {}

  async execute(
    tenantId: TenantId,
    user: AuthenticatedUser,
    companyId: string,
  ): Promise<AnalysisResponse> {
    await this.companies.findOwnedOrThrow(tenantId, companyId);
    const profile = toFatorRInput(
      await this.prisma.taxProfile.findFirst({
        where: { companyId, accountingFirmId: tenantId },
        select: PROFILE_INPUT_SELECT,
      }),
    );
    if (
      profile?.taxRegime != null &&
      profile.taxRegime !== 'SIMPLES_NACIONAL'
    ) {
      throw new UnprocessableEntityException(
        'O Fator R só se aplica ao Simples Nacional; a empresa está noutro regime.',
      );
    }

    const input = profile ?? EMPTY_INPUT;
    const versions =
      await this.taxRules.publishedVersions(SIMPLES_FATOR_R_CODE);
    const version = input.referencePeriod
      ? selectVersion(versions, input.referencePeriod)
      : null;
    const outcome = version ? evaluate(version, input) : null;
    const signal = classify({
      profile,
      ruleVersion: version,
      // A análise que se grava passa a ser a última.
      lastAnalysisRuleVersionId: null,
      currentPeriod: currentPeriod(),
    });

    const completed = outcome?.status === 'COMPLETED';
    const trace = {
      outcome:
        outcome && 'code' in outcome
          ? {
              status: outcome.status,
              code: outcome.code,
              message: outcome.message,
            }
          : { status: outcome?.status ?? 'INCOMPLETE' },
      steps: outcome?.trace ?? [],
      missing:
        outcome?.status === 'INCOMPLETE'
          ? outcome.missing
          : missingFields(input),
      assumptions: outcome?.assumptions ?? [],
      reasons: signal.reasons,
    };

    const row = await this.prisma.analysis.create({
      data: {
        accountingFirmId: tenantId,
        companyId,
        executedById: user.id,
        taxRuleVersionId: version?.id ?? null,
        parametersChecksum: version?.checksum ?? null,
        engineVersion: ENGINE_VERSION,
        inputSnapshot: { ...input },
        status: completed ? 'COMPLETED' : 'INCOMPLETE',
        radarStatus: signal.status,
        result: completed ? { ...outcome.result } : Prisma.DbNull,
        trace: JSON.parse(JSON.stringify(trace)) as Prisma.InputJsonObject,
      },
      select: DETAIL_SELECT,
    });
    return toDetail(row);
  }

  /** Histórico da empresa, mais recente primeiro (US15). */
  async list(
    tenantId: TenantId,
    companyId: string,
    { page, pageSize }: ListAnalysesQuery,
  ): Promise<AnalysisPageResponse> {
    await this.companies.findOwnedOrThrow(tenantId, companyId);
    const where = { accountingFirmId: tenantId, companyId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.analysis.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.analysis.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page, pageSize };
  }

  async findOwnedOrThrow(
    tenantId: TenantId,
    id: string,
  ): Promise<AnalysisResponse> {
    const row = await this.prisma.analysis.findFirst({
      where: { id, accountingFirmId: tenantId },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return toDetail(row);
  }
}
