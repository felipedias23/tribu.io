import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { companyKeys, listCompanies } from './api';
import { formatCnpj } from './cnpj';
import styles from './Companies.module.css';
import { canEditCompanies } from './permissions';

/**
 * Carteira de empresas do escritório (US07). A pesquisa e a página ficam no
 * URL, para que voltar atrás ou partilhar o link mantenha a lista.
 */
export function CompaniesPage() {
  useDocumentTitle('Empresas');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: companyKeys.list({ search, page }),
    queryFn: () => listCompanies({ search, page }),
    placeholderData: keepPreviousData,
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('search')).trim();
    setParams(value ? { search: value } : {});
  }

  function goToPage(next: number) {
    setParams({ ...(search && { search }), page: String(next) });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <div className={styles.header}>
        <h1 id="page-title" className={styles.title}>
          Empresas
        </h1>
        {user && canEditCompanies(user.role) && (
          <Link to="/companies/new" className={styles.primaryButton}>
            Nova empresa
          </Link>
        )}
      </div>

      <form role="search" className={styles.search} onSubmit={onSearch}>
        <label htmlFor="company-search" className="visually-hidden">
          Pesquisar empresas
        </label>
        <input
          key={search}
          id="company-search"
          name="search"
          type="search"
          defaultValue={search}
          placeholder="Razão social, nome fantasia ou CNPJ"
          maxLength={100}
          className={styles.searchInput}
        />
        <button type="submit" className={styles.secondaryButton}>
          Pesquisar
        </button>
      </form>

      {isPending && <p role="status">A carregar empresas…</p>}
      {isError && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className={styles.empty}>
          {search ? `Nenhuma empresa encontrada para "${search}".` : 'Ainda não há empresas cadastradas.'}
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <table className={styles.table}>
            <caption className="visually-hidden">Empresas do escritório</caption>
            <thead>
              <tr>
                <th scope="col">Razão social</th>
                <th scope="col">Nome fantasia</th>
                <th scope="col">CNPJ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((company) => (
                <tr key={company.id}>
                  <td data-label="Razão social">
                    <Link to={`/companies/${company.id}`}>{company.legalName}</Link>
                  </td>
                  <td data-label="Nome fantasia">{company.tradeName ?? '—'}</td>
                  <td data-label="CNPJ" className={styles.cnpj}>
                    {formatCnpj(company.cnpj)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav aria-label="Paginação" className={styles.pagination}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Anterior
            </button>
            <p>
              Página {data.page} de {totalPages} · {data.total} {data.total === 1 ? 'empresa' : 'empresas'}
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Seguinte
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
