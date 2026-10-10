import { apiRequest } from '../shared/api/http';

export type ImportStatus = 'PREVIEW' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type ImportOutcome = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'CONFLICT' | 'ERROR';

export interface ImportCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
  conflict: number;
  error: number;
  ignoredColumns: string[];
}

/** Espelha ImportBatchSummaryResponse do backend. */
export interface ImportSummary {
  id: string;
  status: ImportStatus;
  fileName: string;
  fileFormat: 'CSV' | 'XLSX';
  origin: string;
  summary: ImportCounts;
  createdBy: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
}

export interface ImportRow {
  line: number;
  outcome: ImportOutcome;
  cnpj: string | null;
  legalName: string | null;
  externalId: string | null;
  companyId: string | null;
  changes: { field: string; before: string | boolean | null; after: string | boolean }[];
  errors: { column: string; message: string }[];
  reason: string | null;
}

/** Espelha ImportBatchResponse: as linhas só existem enquanto PREVIEW (D37). */
export interface ImportDetail extends ImportSummary {
  rows: ImportRow[] | null;
}

export interface ImportPage {
  items: ImportSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE = 20;
/** Limite do ficheiro (D35): verificado também no browser, antes de enviar. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_ORIGIN = 'Importação de ficheiros';

export const importKeys = {
  all: ['imports'] as const,
  list: (page: number) => [...importKeys.all, 'list', page] as const,
  detail: (id: string) => [...importKeys.all, 'detail', id] as const,
};

export function createImport(input: {
  fileName: string;
  contentBase64: string;
  origin: string;
}): Promise<ImportDetail> {
  return apiRequest('/imports', { method: 'POST', body: JSON.stringify(input) });
}

export function listImports(page: number): Promise<ImportPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  return apiRequest(`/imports?${query.toString()}`);
}

export function getImport(id: string): Promise<ImportDetail> {
  return apiRequest(`/imports/${encodeURIComponent(id)}`);
}

export function confirmImport(id: string): Promise<ImportDetail> {
  return apiRequest(`/imports/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
}

export function cancelImport(id: string): Promise<ImportDetail> {
  return apiRequest(`/imports/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}
