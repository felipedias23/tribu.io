import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '../auth/authenticated-user';
import { CompaniesService } from '../companies/companies.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PutTaxProfileDto } from './dto/put-tax-profile.dto';
import type { TaxProfileResponse } from './dto/tax-profile.response';

const TAX_PROFILE_SELECT = {
  taxRegime: true,
  cnae: true,
  city: true,
  state: true,
  revenue12m: true,
  payroll12m: true,
  referencePeriod: true,
  updatedAt: true,
} satisfies Prisma.TaxProfileSelect;

type TaxProfileRow = Prisma.TaxProfileGetPayload<{
  select: typeof TAX_PROFILE_SELECT;
}>;

const EMPTY_PROFILE: TaxProfileResponse = {
  taxRegime: null,
  cnae: null,
  city: null,
  state: null,
  revenue12m: null,
  payroll12m: null,
  referencePeriod: null,
  updatedAt: null,
};

/**
 * Perfil tributário de uma empresa (US08). A empresa é sempre verificada no
 * escritório da sessão antes do perfil (regra S4).
 */
@Injectable()
export class TaxProfilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
  ) {}

  async get(
    tenantId: TenantId,
    companyId: string,
  ): Promise<TaxProfileResponse> {
    await this.companies.findOwnedOrThrow(tenantId, companyId);
    const profile = await this.prisma.taxProfile.findFirst({
      where: { companyId, accountingFirmId: tenantId },
      select: TAX_PROFILE_SELECT,
    });
    return profile ? toResponse(profile) : EMPTY_PROFILE;
  }

  /** Cria ou substitui o perfil inteiro; campo omitido fica ausente (null). */
  async put(
    tenantId: TenantId,
    companyId: string,
    dto: PutTaxProfileDto,
  ): Promise<TaxProfileResponse> {
    await this.companies.findOwnedOrThrow(tenantId, companyId);
    const data = {
      taxRegime: dto.taxRegime ?? null,
      cnae: dto.cnae ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      revenue12m: dto.revenue12m ?? null,
      payroll12m: dto.payroll12m ?? null,
      referencePeriod: dto.referencePeriod
        ? new Date(`${dto.referencePeriod}-01T00:00:00.000Z`)
        : null,
    };
    const profile = await this.prisma.taxProfile.upsert({
      where: {
        companyId_accountingFirmId: { companyId, accountingFirmId: tenantId },
        accountingFirmId: tenantId,
      },
      create: { accountingFirmId: tenantId, companyId, ...data },
      update: data,
      select: TAX_PROFILE_SELECT,
    });
    return toResponse(profile);
  }
}

function toResponse(profile: TaxProfileRow): TaxProfileResponse {
  return {
    ...profile,
    revenue12m: profile.revenue12m?.toFixed(2) ?? null,
    payroll12m: profile.payroll12m?.toFixed(2) ?? null,
    referencePeriod: profile.referencePeriod?.toISOString().slice(0, 7) ?? null,
  };
}
