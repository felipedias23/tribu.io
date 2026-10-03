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
