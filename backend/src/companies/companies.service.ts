import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantId } from '../auth/authenticated-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCnpj } from './cnpj';
import type {
  CompanyPageResponse,
  CompanyResponse,
} from './dto/company.response';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { ListCompaniesQuery } from './dto/list-companies.query';
import type { UpdateCompanyDto } from './dto/update-company.dto';

const COMPANY_SELECT = {
  id: true,
  cnpj: true,
  legalName: true,
  tradeName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

const NOT_FOUND = 'Empresa não encontrada.';
const DUPLICATE_CNPJ = 'Já existe uma empresa com este CNPJ no escritório.';

/**
 * Empresas do escritório (US06, US07). Toda consulta filtra pelo tenant da
 * sessão; uma empresa de outro escritório é tratada como inexistente (404).
 */
@Injectable()
export class CompaniesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    tenantId: TenantId,
    { search, page, pageSize }: ListCompaniesQuery,
  ): Promise<CompanyPageResponse> {
    const where: Prisma.CompanyWhereInput = {
      accountingFirmId: tenantId,
      ...(search && { OR: this.searchFilters(search) }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        select: COMPANY_SELECT,
        orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Empresa do escritório ou 404. As rotas aninhadas (/companies/:id/…)
   * verificam o pai por aqui (regra S4).
   */
  async findOwnedOrThrow(
    tenantId: TenantId,
    id: string,
  ): Promise<CompanyResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id, accountingFirmId: tenantId },
      select: COMPANY_SELECT,
    });
    if (!company) throw new NotFoundException(NOT_FOUND);
    return company;
  }

  async create(
    tenantId: TenantId,
    dto: CreateCompanyDto,
  ): Promise<CompanyResponse> {
    try {
      return await this.prisma.company.create({
        data: {
          accountingFirmId: tenantId,
          cnpj: dto.cnpj,
          legalName: dto.legalName,
          tradeName: dto.tradeName ?? null,
        },
        select: COMPANY_SELECT,
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(
    tenantId: TenantId,
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyResponse> {
    try {
      return await this.prisma.company.update({
        where: { id, accountingFirmId: tenantId },
        data: {
          cnpj: dto.cnpj,
          legalName: dto.legalName,
          tradeName: dto.tradeName,
        },
        select: COMPANY_SELECT,
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Pesquisa por nome (sem distinguir maiúsculas) ou por parte do CNPJ. */
  private searchFilters(search: string): Prisma.CompanyWhereInput[] {
    const filters: Prisma.CompanyWhereInput[] = [
      { legalName: { contains: search, mode: 'insensitive' } },
      { tradeName: { contains: search, mode: 'insensitive' } },
    ];
    const cnpj = normalizeCnpj(search);
    if (cnpj) filters.push({ cnpj: { contains: cnpj } });
    return filters;
  }

  private translate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return new ConflictException(DUPLICATE_CNPJ);
      if (error.code === 'P2025') return new NotFoundException(NOT_FOUND);
    }
    return error;
  }
}
