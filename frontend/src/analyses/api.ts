import type { TaxRegime } from '../companies/api';
import type { RadarStatus } from '../radar/api';
import { apiRequest } from '../shared/api/http';

/** Campos obrigatórios do cálculo do Fator R. */
export type RequiredField = 'taxRegime' | 'revenue12m' | 'payroll12m' | 'referencePeriod';

/** Regra e versão usadas (D30). Datas AAAA-MM-DD; `validUntil` é exclusivo. */
export interface AnalysisRuleVersion {
  id: string;
  ruleCode: string;
  ruleName: string;
  version: number;
  evaluatorKey: string;
  validFrom: string;
  validUntil: string | null;
  source: string;
}

export interface AnalysisResult {
  fatorR: string;
  annex: 'III' | 'V';
  bracket: number;
  nominalRate: string;
  deduction: string;
  effectiveRate: string;
}

/** Espelha AnalysisSummaryResponse do backend. */
export interface AnalysisSummary {
  id: string;
  companyId: string;
  status: 'COMPLETED' | 'INCOMPLETE';
  radarStatus: RadarStatus;
  executedAt: string;
  executedBy: { id: string; name: string };
  ruleVersion: AnalysisRuleVersion | null;
  result: AnalysisResult | null;
}

export interface AnalysisInput {
  taxRegime: TaxRegime | null;
  cnae: string | null;
  revenue12m: string | null;
  payroll12m: string | null;
  referencePeriod: string | null;
}

/** Raciocínio gravado com a análise (US11). */
export interface AnalysisTrace {
  outcome: { status: string; code?: string; message?: string };
  steps: { code: string; description: string; values: Record<string, string> }[];
  missing: RequiredField[];
  assumptions: { code: string; description: string }[];
  reasons: { code: string; message: string }[];
}

/** Espelha AnalysisResponse do backend. */
export interface Analysis extends AnalysisSummary {
  engineVersion: string;
  parametersChecksum: string | null;
  input: AnalysisInput;
  trace: AnalysisTrace;
}

export interface AnalysisPage {
  items: AnalysisSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE = 10;

export const analysisKeys = {
  all: ['analyses'] as const,
  list: (companyId: string, page: number) => [...analysisKeys.all, 'list', companyId, page] as const,
  detail: (id: string) => [...analysisKeys.all, 'detail', id] as const,
};

export function executeAnalysis(companyId: string): Promise<Analysis> {
  return apiRequest(`/companies/${encodeURIComponent(companyId)}/analyses`, { method: 'POST' });
}

export function listAnalyses(companyId: string, page: number): Promise<AnalysisPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  return apiRequest(`/companies/${encodeURIComponent(companyId)}/analyses?${query.toString()}`);
}

export function getAnalysis(id: string): Promise<Analysis> {
  return apiRequest(`/analyses/${encodeURIComponent(id)}`);
}
