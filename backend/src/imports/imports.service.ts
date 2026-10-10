import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser, TenantId } from '../auth/authenticated-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentPeriod } from '../tax-calculations/profile-input';
import { DEFAULT_ORIGIN, type CreateImportDto } from './dto/create-import.dto';
import type {
  ImportBatchPageResponse,
  ImportBatchResponse,
  ImportBatchSummaryResponse,
} from './dto/import.response';
import type { ListImportsQuery } from './dto/list-imports.query';
import {
  classifyRows,
  type CurrentCompany,
  type PortfolioState,
  type PreviewRow,
  summarize,
} from './import-preview';
import { ImportFileError } from './reading/limits';
import type { ImportedProfile, ImportedValues } from './reading/normalize';
import { readImportFile, type ImportFileRow } from './reading/read-import-file';

/** Validade da prévia (D37). */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cliente da transação do PrismaService (com a verificação de tenant, D16).
 * O próprio PrismaService também serve, fora de uma transação.
 */
type TransactionCallback = Extract<
  Parameters<PrismaService['$transaction']>[0],
  (...args: never[]) => unknown
>;
type Db = Parameters<TransactionCallback>[0];

const BATCH_SELECT = {
  id: true,
  status: true,
  fileName: true,
  fileFormat: true,
  summary: true,
  createdAt: true,
  expiresAt: true,
  closedAt: true,
  integration: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ImportBatchSelect;

const BATCH_DETAIL_SELECT = {
  ...BATCH_SELECT,
  integrationId: true,
  preview: true,
} satisfies Prisma.ImportBatchSelect;

type BatchRow = Prisma.ImportBatchGetPayload<{ select: typeof BATCH_SELECT }>;
type BatchDetailRow = Prisma.ImportBatchGetPayload<{
  select: typeof BATCH_DETAIL_SELECT;
}>;

interface StoredSummary extends ReturnType<typeof summarize> {
  ignoredColumns: string[];
  closedBy?: { id: string; name: string };
}

interface StoredPreview {
  rows: PreviewRow[];
}

const companyStateSelect = (integrationId: string) =>
  ({
    id: true,
    cnpj: true,
    legalName: true,
    tradeName: true,
    taxProfile: {
      select: {
        taxRegime: true,
        cnae: true,
        city: true,
        state: true,
        revenue12m: true,
        payroll12m: true,
        referencePeriod: true,
        fatorRSubject: true,
      },
    },
    externalIds: {
      where: { integrationId },
      select: { externalId: true },
    },
  }) satisfies Prisma.CompanySelect;

type CompanyStateRow = Prisma.CompanyGetPayload<{
  select: ReturnType<typeof companyStateSelect>;
}>;

function toCurrent(company: CompanyStateRow): CurrentCompany {
  const profile = company.taxProfile;
  return {
    id: company.id,
    cnpj: company.cnpj,
    legalName: company.legalName,
    tradeName: company.tradeName,
    externalId: company.externalIds[0]?.externalId ?? null,
    profile: profile && {
      taxRegime: profile.taxRegime,
      cnae: profile.cnae,
      city: profile.city,
      state: profile.state,
      revenue12m: profile.revenue12m?.toFixed(2) ?? null,
      payroll12m: profile.payroll12m?.toFixed(2) ?? null,
      referencePeriod:
        profile.referencePeriod?.toISOString().slice(0, 7) ?? null,
      fatorRSubject: profile.fatorRSubject,
    },
  };
}

/** Campos do perfil presentes na linha, no formato do Prisma (D34). */
function profileData(profile: ImportedProfile) {
  const { referencePeriod, ...rest } = profile;
  return {
    ...rest,
    ...(referencePeriod !== undefined && {
      referencePeriod: new Date(`${referencePeriod}-01T00:00:00.000Z`),
    }),
  };
}

function toSummary(batch: BatchRow): ImportBatchSummaryResponse {
  const { ignoredColumns, closedBy, ...counts } =
    batch.summary as unknown as StoredSummary;
  return {
    id: batch.id,
    status: batch.status,
    fileName: batch.fileName,
    fileFormat: batch.fileFormat,
    origin: batch.integration.name,
    summary: { ...counts, ignoredColumns },
    createdBy: batch.createdBy,
    createdAt: batch.createdAt,
    expiresAt: batch.expiresAt,
    closedAt: batch.closedAt,
    closedBy: closedBy ?? null,
  };
}

function toDetail(batch: BatchDetailRow): ImportBatchResponse {
  const preview = batch.preview as unknown as StoredPreview | null;
  return {
    ...toSummary(batch),
    rows: preview?.rows.map(({ values: _values, ...row }) => row) ?? null,
  };
}

/**
 * O que a confirmação compara para saber se a carteira mudou (D37). Cada
 * mudança vira um trio: o JSONB do PostgreSQL reordena as chaves dos objetos,
 * e a prévia guardada não pode parecer diferente só por isso.
 */
function fingerprint(rows: PreviewRow[]): string {
  return JSON.stringify(
    rows.map((r) => [
      r.line,
      r.outcome,
      r.companyId,
      r.reason,
      r.changes.map((c) => [c.field, c.before, c.after]),
    ]),
  );
}

const NOT_FOUND = 'Importação não encontrada.';

/**
 * Importação de empresas por ficheiro (US12, US13, D34–D38). A prévia é
 * guardada sem gravar nada na carteira; a confirmação volta a classificar
 * tudo numa transação e só aplica se nada mudou.
 */
@Injectable()
export class ImportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(
    tenantId: TenantId,
    user: AuthenticatedUser,
    dto: CreateImportDto,
  ): Promise<ImportBatchResponse> {
    let content;
    try {
      content = readImportFile({
        fileName: dto.fileName,
        bytes: new Uint8Array(Buffer.from(dto.contentBase64, 'base64')),
        currentPeriod: currentPeriod(),
      });
    } catch (error) {
      if (error instanceof ImportFileError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    const integration = await this.prisma.integration.upsert({
      where: {
        accountingFirmId_type_name: {
          accountingFirmId: tenantId,
          type: 'FILE',
          name: dto.origin ?? DEFAULT_ORIGIN,
        },
        accountingFirmId: tenantId,
      },
      create: {
        accountingFirmId: tenantId,
        type: 'FILE',
        name: dto.origin ?? DEFAULT_ORIGIN,
      },
      update: {},
      select: { id: true },
    });
    const rows = classifyRows(
      content.rows,
      await this.portfolio(this.prisma, tenantId, integration.id, content.rows),
    );
    const now = Date.now();
    const batch = await this.prisma.importBatch.create({
      data: {
        accountingFirmId: tenantId,
        integrationId: integration.id,
        createdById: user.id,
        status: 'PREVIEW',
        fileName: dto.fileName,
        fileFormat: content.format,
        preview: { rows } as unknown as Prisma.InputJsonObject,
        summary: {
          ...summarize(rows),
          ignoredColumns: content.ignoredColumns,
        },
        createdAt: new Date(now),
        expiresAt: new Date(now + PREVIEW_TTL_MS),
      },
      select: BATCH_DETAIL_SELECT,
    });
    return toDetail(batch);
  }

  async list(
    tenantId: TenantId,
    { page, pageSize }: ListImportsQuery,
  ): Promise<ImportBatchPageResponse> {
    await this.expireStale(tenantId);
    const where = { accountingFirmId: tenantId };
    const [batches, total] = await this.prisma.$transaction([
      this.prisma.importBatch.findMany({
        where,
        select: BATCH_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.importBatch.count({ where }),
    ]);
    return { items: batches.map(toSummary), total, page, pageSize };
  }

  async findOwnedOrThrow(
    tenantId: TenantId,
    id: string,
  ): Promise<ImportBatchResponse> {
    await this.expireStale(tenantId);
    return toDetail(await this.findBatch(this.prisma, tenantId, id));
  }

  /**
   * Confirma a prévia (D37): numa transação serializável, volta a ler a
   * carteira e a classificar as linhas. Se algo mudou, responde 409 e nada é
   * aplicado; senão cria e atualiza as empresas, os perfis e os ids externos.
   */
  async confirm(
    tenantId: TenantId,
    user: AuthenticatedUser,
    id: string,
  ): Promise<ImportBatchResponse> {
    await this.expireStale(tenantId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const batch = await this.findOpenBatch(tx, tenantId, id);
          const stored = (batch.preview as unknown as StoredPreview).rows;
          const input: ImportFileRow[] = stored.map((r) => ({
            line: r.line,
            values: r.values,
            errors: r.errors,
          }));
          const fresh = classifyRows(
            input,
            await this.portfolio(tx, tenantId, batch.integrationId, input),
          );
          if (fingerprint(fresh) !== fingerprint(stored)) {
            throw new ConflictException(
              'A carteira mudou desde a prévia: envie o ficheiro de novo para ver uma prévia atualizada.',
            );
          }
          for (const row of fresh) {
            if (row.outcome === 'NEW') {
              await this.create(tx, tenantId, batch.integrationId, row.values);
            } else if (row.outcome === 'UPDATED') {
              await this.update(tx, tenantId, batch.integrationId, row);
            }
          }
          return this.close(tx, tenantId, batch, 'CONFIRMED', user);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        throw new ConflictException(
          'A carteira mudou durante a confirmação: envie o ficheiro de novo.',
        );
      }
      throw error;
    }
  }

  async cancel(
    tenantId: TenantId,
    user: AuthenticatedUser,
    id: string,
  ): Promise<ImportBatchResponse> {
    await this.expireStale(tenantId);
    const batch = await this.findOpenBatch(this.prisma, tenantId, id);
    return this.close(this.prisma, tenantId, batch, 'CANCELLED', user);
  }

  /**
   * Prévias com mais de 24 horas passam a EXPIRED e perdem as linhas (D37).
   * Feito ao ler, sem tarefa agendada.
   */
  private async expireStale(tenantId: TenantId): Promise<void> {
    const now = new Date();
    await this.prisma.importBatch.updateMany({
      where: {
        accountingFirmId: tenantId,
        status: 'PREVIEW',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED', preview: Prisma.DbNull, closedAt: now },
    });
  }

  private async findBatch(db: Db, tenantId: TenantId, id: string) {
    const batch = await db.importBatch.findFirst({
      where: { id, accountingFirmId: tenantId },
      select: BATCH_DETAIL_SELECT,
    });
    if (!batch) throw new NotFoundException(NOT_FOUND);
    return batch;
  }

  private async findOpenBatch(db: Db, tenantId: TenantId, id: string) {
    const batch = await this.findBatch(db, tenantId, id);
    const closed: Record<string, string> = {
      CONFIRMED: 'Esta importação já foi confirmada.',
      CANCELLED: 'Esta importação foi cancelada.',
      EXPIRED:
        'A prévia expirou (24 horas): envie o ficheiro de novo para uma prévia atualizada.',
    };
    if (batch.status !== 'PREVIEW') {
      throw new ConflictException(closed[batch.status]);
    }
    // Pode ter expirado depois da limpeza do início do pedido.
    if (batch.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(closed.EXPIRED);
    }
    return batch;
  }

  private async close(
    db: Db,
    tenantId: TenantId,
    batch: BatchDetailRow,
    status: 'CONFIRMED' | 'CANCELLED',
    user: AuthenticatedUser,
  ): Promise<ImportBatchResponse> {
    const closed = await db.importBatch.update({
      where: { id: batch.id, accountingFirmId: tenantId },
      data: {
        status,
        preview: Prisma.DbNull,
        closedAt: new Date(),
        summary: {
          ...(batch.summary as unknown as StoredSummary),
          closedBy: { id: user.id, name: user.name },
        },
      },
      select: BATCH_DETAIL_SELECT,
    });
    return toDetail(closed);
  }

  /** Empresas do escritório tocadas pelo ficheiro, por CNPJ e por id externo. */
  private async portfolio(
    db: Db,
    tenantId: TenantId,
    integrationId: string,
    rows: readonly ImportFileRow[],
  ): Promise<PortfolioState> {
    const select = companyStateSelect(integrationId);
    const cnpjs = rows.flatMap((r) => (r.values.cnpj ? [r.values.cnpj] : []));
    const externalIds = rows.flatMap((r) =>
      r.values.externalId ? [r.values.externalId] : [],
    );
    const [companies, mappings] = await Promise.all([
      db.company.findMany({
        where: { accountingFirmId: tenantId, cnpj: { in: cnpjs } },
        select,
      }),
      db.externalCompanyMapping.findMany({
        where: {
          accountingFirmId: tenantId,
          integrationId,
          externalId: { in: externalIds },
        },
        select: { externalId: true, company: { select } },
      }),
    ]);
    return {
      byCnpj: new Map(companies.map((c) => [c.cnpj, toCurrent(c)])),
      byExternalId: new Map(
        mappings.map((m) => [m.externalId, toCurrent(m.company)]),
      ),
    };
  }

  private async create(
    db: Db,
    tenantId: TenantId,
    integrationId: string,
    values: ImportedValues,
  ): Promise<void> {
    const company = await db.company.create({
      data: {
        accountingFirmId: tenantId,
        cnpj: values.cnpj as string,
        legalName: values.legalName as string,
        tradeName: values.tradeName ?? null,
      },
      select: { id: true },
    });
    if (Object.keys(values.profile).length > 0) {
      await db.taxProfile.create({
        data: {
          accountingFirmId: tenantId,
          companyId: company.id,
          ...profileData(values.profile),
        },
      });
    }
    if (values.externalId !== undefined) {
      await db.externalCompanyMapping.create({
        data: {
          accountingFirmId: tenantId,
          integrationId,
          companyId: company.id,
          externalId: values.externalId,
        },
      });
    }
  }

  private async update(
    db: Db,
    tenantId: TenantId,
    integrationId: string,
    row: PreviewRow,
  ): Promise<void> {
    const companyId = row.companyId as string;
    const { values } = row;
    const fields = new Set(row.changes.map((c) => c.field));
    if (fields.has('legalName') || fields.has('tradeName')) {
      await db.company.update({
        where: { id: companyId, accountingFirmId: tenantId },
        data: { legalName: values.legalName, tradeName: values.tradeName },
      });
    }
    if (Object.keys(values.profile).length > 0) {
      const data = profileData(values.profile);
      await db.taxProfile.upsert({
        where: {
          companyId_accountingFirmId: { companyId, accountingFirmId: tenantId },
          accountingFirmId: tenantId,
        },
        create: { accountingFirmId: tenantId, companyId, ...data },
        update: data,
      });
    }
    if (fields.has('externalId')) {
      await db.externalCompanyMapping.create({
        data: {
          accountingFirmId: tenantId,
          integrationId,
          companyId,
          externalId: values.externalId as string,
        },
      });
    }
  }
}
