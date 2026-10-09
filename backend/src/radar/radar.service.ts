import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '../auth/authenticated-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FatorRInput } from '../tax-calculations/evaluation';
import { selectVersion } from '../tax-calculations/rule-version-selection';
import { SIMPLES_FATOR_R_CODE } from '../tax-rules/simples-fator-r.parameters';
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
  taxProfile: {
    select: {
      taxRegime: true,
      cnae: true,
      revenue12m: true,
      payroll12m: true,
      referencePeriod: true,
    },
  },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;

const byLegalName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Mês atual em UTC, AAAA-MM (o mesmo relógio do perfil tributário). */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function toInput(profile: CompanyRow['taxProfile']): FatorRInput | null {
  if (!profile) return null;
  return {
    taxRegime: profile.taxRegime,
    cnae: profile.cnae,
    revenue12m: profile.revenue12m?.toFixed(2) ?? null,
    payroll12m: profile.payroll12m?.toFixed(2) ?? null,
    referencePeriod: profile.referencePeriod?.toISOString().slice(0, 7) ?? null,
  };
}

/**
 * Tax Radar (US10). O estado é calculado a cada pedido (D26), a partir do
 * perfil atual e da versão da regra vigente no mês de referência. A carteira
 * inteira é lida numa consulta e classificada em memória: com centenas de
 * empresas, o custo é baixo; o gatilho para guardar o estado está na D26.
 */
@Injectable()
export class RadarService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    const [companies, versions] = await Promise.all([
      this.prisma.company.findMany({
        where: { accountingFirmId: tenantId },
        select: COMPANY_SELECT,
      }),
      this.prisma.taxRuleVersion.findMany({
        where: {
          taxRule: { code: SIMPLES_FATOR_R_CODE },
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          version: true,
          evaluatorKey: true,
          parameters: true,
          status: true,
          validFrom: true,
          validUntil: true,
        },
      }),
    ]);
    const period = currentPeriod();

    const items = companies.map(({ taxProfile, ...company }) => {
      const profile = toInput(taxProfile);
      const ruleVersion = profile?.referencePeriod
        ? selectVersion(versions, profile.referencePeriod)
        : null;
      const signal = classify({
        profile,
        ruleVersion,
        // As análises entram no passo seguinte; até lá, nenhuma empresa foi
        // analisada.
        lastAnalysisRuleVersionId: null,
        currentPeriod: period,
      });
      const evaluation = signal.evaluation;
      return {
        company,
        status: signal.status,
        priorityScore: signal.priorityScore,
        reasons: signal.reasons,
        ruleVersion: signal.ruleVersion,
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
