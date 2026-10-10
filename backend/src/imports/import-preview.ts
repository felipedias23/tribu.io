import type { TaxRegime } from '../generated/prisma/enums';
import type {
  ImportedProfile,
  ImportedValues,
  ImportRowError,
} from './reading/normalize';
import type { ImportFileRow } from './reading/read-import-file';

/** Perfil atual de uma empresa, com os valores como na API (decimais em texto). */
export interface CurrentProfile {
  taxRegime: TaxRegime | null;
  cnae: string | null;
  city: string | null;
  state: string | null;
  revenue12m: string | null;
  payroll12m: string | null;
  referencePeriod: string | null;
  fatorRSubject: boolean | null;
}

export interface CurrentCompany {
  id: string;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  profile: CurrentProfile | null;
  /** Id externo da empresa nesta origem, se já tiver. */
  externalId: string | null;
}

/** Carteira do escritório, nas partes que a importação compara (D36). */
export interface PortfolioState {
  byCnpj: ReadonlyMap<string, CurrentCompany>;
  byExternalId: ReadonlyMap<string, CurrentCompany>;
}

export type PreviewOutcome =
  'NEW' | 'UPDATED' | 'UNCHANGED' | 'CONFLICT' | 'ERROR';

export interface FieldChange {
  field: string;
  before: string | boolean | null;
  after: string | boolean;
}

export interface PreviewRow {
  line: number;
  outcome: PreviewOutcome;
  cnpj: string | null;
  legalName: string | null;
  externalId: string | null;
  /** Empresa existente (UPDATED, UNCHANGED). */
  companyId: string | null;
  /** Campos que mudam (UPDATED), com o antes e o depois. */
  changes: FieldChange[];
  errors: ImportRowError[];
  /** Motivo do conflito. */
  reason: string | null;
  /**
   * Valores lidos da linha. A confirmação volta a classificar todas as linhas
   * (as repetições dependem do ficheiro inteiro) e aplica os de NEW e UPDATED.
   */
  values: ImportedValues;
}

const PROFILE_FIELDS: (keyof ImportedProfile)[] = [
  'taxRegime',
  'cnae',
  'city',
  'state',
  'revenue12m',
  'payroll12m',
  'referencePeriod',
  'fatorRSubject',
];

function row(
  line: number,
  values: ImportedValues,
  outcome: PreviewOutcome,
  extra: Partial<PreviewRow> = {},
): PreviewRow {
  return {
    line,
    outcome,
    cnpj: values.cnpj ?? null,
    legalName: values.legalName ?? null,
    externalId: values.externalId ?? null,
    companyId: null,
    changes: [],
    errors: [],
    reason: null,
    values,
    ...extra,
  };
}

/** Campos preenchidos que diferem do atual. Célula vazia não altera (D34). */
function changesOf(
  values: ImportedValues,
  company: CurrentCompany,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const compare = (
    field: string,
    after: string | boolean | undefined,
    before: string | boolean | null,
  ) => {
    if (after !== undefined && after !== before) {
      changes.push({ field, before, after });
    }
  };
  compare('legalName', values.legalName, company.legalName);
  compare('tradeName', values.tradeName, company.tradeName);
  for (const field of PROFILE_FIELDS) {
    compare(field, values.profile[field], company.profile?.[field] ?? null);
  }
  if (values.externalId !== undefined && company.externalId === null) {
    compare('externalId', values.externalId, null);
  }
  return changes;
}

/** Linhas onde um valor aparece mais de uma vez no ficheiro. */
function repeated(
  rows: readonly ImportFileRow[],
  key: (values: ImportedValues) => string | undefined,
): Map<string, number[]> {
  const lines = new Map<string, number[]>();
  for (const r of rows) {
    const value = r.errors.length === 0 ? key(r.values) : undefined;
    if (value !== undefined)
      lines.set(value, [...(lines.get(value) ?? []), r.line]);
  }
  return new Map([...lines].filter(([, l]) => l.length > 1));
}

/**
 * Classifica cada linha do ficheiro contra a carteira atual (D36). Função
 * pura: a confirmação volta a chamá-la para saber se a carteira mudou (D37).
 *
 * Ordem: erro → repetição no ficheiro → id externo já mapeado → CNPJ no
 * escritório → empresa nova. Um id externo e um CNPJ que apontam para
 * empresas diferentes são conflito; nada é aplicado automaticamente.
 */
export function classifyRows(
  rows: readonly ImportFileRow[],
  portfolio: PortfolioState,
): PreviewRow[] {
  const repeatedCnpj = repeated(rows, (v) => v.cnpj);
  const repeatedExternal = repeated(rows, (v) => v.externalId);

  return rows.map(({ line, values, errors }) => {
    if (errors.length > 0) return row(line, values, 'ERROR', { errors });

    const cnpj = values.cnpj as string;
    const sameCnpj = repeatedCnpj.get(cnpj);
    if (sameCnpj) {
      return row(line, values, 'CONFLICT', {
        reason: `CNPJ repetido no ficheiro (linhas ${sameCnpj.join(', ')}).`,
      });
    }
    const external = values.externalId;
    const sameExternal = external ? repeatedExternal.get(external) : undefined;
    if (sameExternal) {
      return row(line, values, 'CONFLICT', {
        reason: `Id externo repetido no ficheiro (linhas ${sameExternal.join(', ')}).`,
      });
    }

    const byExternal = external
      ? portfolio.byExternalId.get(external)
      : undefined;
    const byCnpj = portfolio.byCnpj.get(cnpj);
    if (byExternal && byExternal.id !== byCnpj?.id) {
      return row(line, values, 'CONFLICT', {
        reason: byCnpj
          ? `O id externo ${external} é de "${byExternal.legalName}", mas o CNPJ é de "${byCnpj.legalName}".`
          : `O id externo ${external} é de "${byExternal.legalName}", que tem outro CNPJ (${byExternal.cnpj}).`,
      });
    }
    const company = byExternal ?? byCnpj;
    if (!company) return row(line, values, 'NEW');

    if (
      external !== undefined &&
      company.externalId !== null &&
      company.externalId !== external
    ) {
      return row(line, values, 'CONFLICT', {
        companyId: company.id,
        reason: `"${company.legalName}" já tem o id externo ${company.externalId} nesta origem.`,
      });
    }
    const changes = changesOf(values, company);
    return changes.length === 0
      ? row(line, values, 'UNCHANGED', { companyId: company.id })
      : row(line, values, 'UPDATED', {
          companyId: company.id,
          changes,
        });
  });
}

/** Contagens por resultado, para o resumo (US13). */
export function summarize(rows: readonly PreviewRow[]) {
  const count = (outcome: PreviewOutcome) =>
    rows.filter((r) => r.outcome === outcome).length;
  return {
    total: rows.length,
    new: count('NEW'),
    updated: count('UPDATED'),
    unchanged: count('UNCHANGED'),
    conflict: count('CONFLICT'),
    error: count('ERROR'),
  };
}
