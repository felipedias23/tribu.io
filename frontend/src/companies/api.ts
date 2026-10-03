import { apiRequest } from '../shared/api/http';

/** Espelha CompanyResponse do backend. O CNPJ vem sem máscara. */
export interface Company {
  id: string;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyPage {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompanyInput {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
}

export interface CompanyListParams {
  search: string;
  page: number;
}

export const PAGE_SIZE = 20;

/** Chaves do cache: invalidar `companyKeys.all` atualiza listas e detalhes. */
export const companyKeys = {
  all: ['companies'] as const,
  list: (params: CompanyListParams) => [...companyKeys.all, 'list', params] as const,
  detail: (id: string) => [...companyKeys.all, 'detail', id] as const,
  taxProfile: (id: string) => [...companyKeys.all, 'tax-profile', id] as const,
};

export function listCompanies({ search, page }: CompanyListParams): Promise<CompanyPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  return apiRequest(`/companies?${query.toString()}`);
}

export function getCompany(id: string): Promise<Company> {
  return apiRequest(`/companies/${encodeURIComponent(id)}`);
}

export function createCompany(input: CompanyInput): Promise<Company> {
  return apiRequest('/companies', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCompany(id: string, input: CompanyInput): Promise<Company> {
  return apiRequest(`/companies/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export type TaxRegime = 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';

/**
 * Espelha TaxProfileResponse do backend. null é dado ausente (D20); valores
 * em reais vêm como texto ("1200000.00") e o período como "AAAA-MM".
 * `updatedAt` null: o perfil ainda não foi preenchido.
 */
export interface TaxProfile {
  taxRegime: TaxRegime | null;
  cnae: string | null;
  city: string | null;
  state: string | null;
  revenue12m: string | null;
  payroll12m: string | null;
  referencePeriod: string | null;
  updatedAt: string | null;
}

export type TaxProfileInput = Omit<TaxProfile, 'updatedAt'>;

export function getTaxProfile(companyId: string): Promise<TaxProfile> {
  return apiRequest(`/companies/${encodeURIComponent(companyId)}/tax-profile`);
}

export function putTaxProfile(companyId: string, input: TaxProfileInput): Promise<TaxProfile> {
  return apiRequest(`/companies/${encodeURIComponent(companyId)}/tax-profile`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
