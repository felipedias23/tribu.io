import { apiRequest } from '../shared/api/http';

/** Estados do Tax Radar, pela ordem de precedência (§3.5). */
export const RADAR_STATUSES = [
  'DADOS_INCOMPLETOS',
  'REVISAR_REGRA',
  'REQUER_ANALISE',
  'OPORTUNIDADE_PARA_AVALIAR',
  'NORMAL',
] as const;
export type RadarStatus = (typeof RADAR_STATUSES)[number];

/** Espelha RadarItemResponse do backend. Decimais vêm como texto. */
export interface RadarItem {
  company: { id: string; cnpj: string; legalName: string; tradeName: string | null };
  status: RadarStatus;
  priorityScore: number;
  reasons: { code: string; message: string }[];
  ruleVersion: { id: string; version: number; evaluatorKey: string } | null;
  /** Última análise da empresa; null se nunca foi analisada. */
  lastAnalysis: { id: string; status: 'COMPLETED' | 'INCOMPLETE'; executedAt: string } | null;
  result: { fatorR: string; annex: 'III' | 'V'; bracket: number; effectiveRate: string } | null;
}

export interface RadarPage {
  items: RadarItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RadarSummary {
  total: number;
  counts: Record<RadarStatus, number>;
}

export interface RadarListParams {
  status: RadarStatus | null;
  page: number;
}

export const PAGE_SIZE = 20;

/**
 * Chaves do cache. Gravar uma empresa ou um perfil invalida `radarKeys.all`:
 * o estado é calculado no pedido (D26) e muda com os dados.
 */
export const radarKeys = {
  all: ['radar'] as const,
  list: (params: RadarListParams) => [...radarKeys.all, 'list', params] as const,
  summary: () => [...radarKeys.all, 'summary'] as const,
};

export function listRadar({ status, page }: RadarListParams): Promise<RadarPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  return apiRequest(`/radar?${query.toString()}`);
}

export function getRadarSummary(): Promise<RadarSummary> {
  return apiRequest('/radar/summary');
}
