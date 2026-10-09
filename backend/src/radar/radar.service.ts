import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '../auth/authenticated-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  currentPeriod,
  PROFILE_INPUT_SELECT,
  toFatorRInput,
} from '../tax-calculations/profile-input';
import { selectVersion } from '../tax-calculations/rule-version-selection';
import { SIMPLES_FATOR_R_CODE } from '../tax-rules/simples-fator-r.parameters';
import { TaxRulesService } from '../tax-rules/tax-rules.service';
import type { ListRadarQuery } from './dto/list-radar.query';
import type {
  RadarItemResponse,
  RadarPageResponse,
  RadarSummaryResponse,
} from './dto/radar.response';
import { classify, RADAR_STATUSES, type RadarStatus } from './radar-classifier';

const COMPANY_SELECT = {
  id: true,
  cnpj: true,
  legalName: true,
  tradeName: true,
  taxProfile: { select: PROFILE_INPUT_SELECT },
} satisfies Prisma.CompanySelect;

const byLegalName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Tax Radar (US10). O estado é calculado a cada pedido (D26), a partir do
 * perfil atual e da versão da regra vigente no mês de referência. A carteira
 * inteira é lida numa consulta e classificada em memória: com centenas de
 * empresas, o custo é baixo; o gatilho para guardar o estado está na D26.
 */
@Injectable()
export class RadarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly taxRules: TaxRulesService,
  ) {}

  async list(
    tenantId: TenantId,
    { status, page, pageSize }: ListRadarQuery,
  ): Promise<RadarPageResponse> {
    const all = await this.classifyPortfolio(tenantId);
    const filtered = status ? all.filter((i) => i.status === status) : all;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async summary(tenantId: TenantId): Promise<RadarSummaryResponse> {
    const all = await this.classifyPortfolio(tenantId);
    const counts = Object.fromEntries(
      RADAR_STATUSES.map((s) => [s, 0]),
    ) as Record<RadarStatus, number>;
    for (const item of all) counts[item.status] += 1;
    return { total: all.length, counts };
  }

  /** Toda a carteira, da maior para a menor prioridade (D30). */
  private async classifyPortfolio(
    tenantId: TenantId,
  ): Promise<RadarItemResponse[]> {
    const [companies, versions, analyses] = await Promise.all([
      this.prisma.company.findMany({
        where: { accountingFirmId: tenantId },
        select: COMPANY_SELECT,
      }),
      this.taxRules.publishedVersions(SIMPLES_FATOR_R_CODE),
      // Última análise de cada empresa (US15): mostra-se no Radar e decide o
      // sinal de versão da regra substituída.
      this.prisma.analysis.findMany({
        where: { accountingFirmId: tenantId },
        distinct: ['companyId'],
        orderBy: [{ companyId: 'asc' }, { executedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          companyId: true,
          taxRuleVersionId: true,
          status: true,
          executedAt: true,
        },
      }),
    ]);
    const lastAnalysis = new Map(analyses.map((a) => [a.companyId, a]));
    const period = currentPeriod();

    const items = companies.map(({ taxProfile, ...company }) => {
      const profile = toFatorRInput(taxProfile);
      const last = lastAnalysis.get(company.id) ?? null;
      const ruleVersion = profile?.referencePeriod
        ? selectVersion(versions, profile.referencePeriod)
        : null;
      const signal = classify({
        profile,
        ruleVersion,
        lastAnalysisRuleVersionId: last?.taxRuleVersionId ?? null,
        currentPeriod: period,
      });
      const evaluation = signal.evaluation;
      return {
        company,
        status: signal.status,
        priorityScore: signal.priorityScore,
        reasons: signal.reasons,
        ruleVersion: signal.ruleVersion,
        lastAnalysis: last
          ? { id: last.id, status: last.status, executedAt: last.executedAt }
          : null,
        result:
          evaluation?.status === 'COMPLETED'
            ? {
                fatorR: evaluation.result.fatorR,
                annex: evaluation.result.annex,
                bracket: evaluation.result.bracket,
                effectiveRate: evaluation.result.effectiveRate,
              }
            : null,
      };
    });

    return items.sort(
      (x, y) =>
        y.priorityScore - x.priorityScore ||
        byLegalName.compare(x.company.legalName, y.company.legalName) ||
        x.company.id.localeCompare(y.company.id),
    );
  }
}
