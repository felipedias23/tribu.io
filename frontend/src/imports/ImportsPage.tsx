import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { importKeys, listImports } from './api';
import { STATUS_LABELS } from './format';
import styles from './Imports.module.css';
import { canImport } from './permissions';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Histórico das importações do escritório (US13). */
export function ImportsPage() {
  useDocumentTitle('Importações');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isPending, isError, error } = useQuery({
    queryKey: importKeys.list(page),
    queryFn: () => listImports(page),
    placeholderData: keepPreviousData,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <div className={styles.header}>
        <h1 id="page-title" className={styles.title}>
          Importações
        </h1>
        {user && canImport(user.role) && (
          <Link to="/imports/new" className={styles.primaryButton}>
            Nova importação
          </Link>
        )}
      </div>
      <p className={styles.hint}>
        Importe a carteira a partir de um ficheiro CSV ou XLSX exportado do seu sistema. Nada é gravado antes de
        confirmar a prévia.
      </p>

      {isPending && <p role="status">A carregar importações…</p>}
      {isError && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}
      {data && data.items.length === 0 && <p className={styles.empty}>Ainda não há importações.</p>}

      {data && data.items.length > 0 && (
        <>
          <ul className={styles.history} aria-label="Histórico de importações">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link to={`/imports/${item.id}`}>{item.fileName}</Link>
                <span>{STATUS_LABELS[item.status]}</span>
                <span className={styles.meta}>
                  {item.summary.new} novas · {item.summary.updated} atualizadas · {item.summary.conflict} conflitos ·{' '}
                  {item.summary.error} com erro
                </span>
                <span className={styles.meta}>
                  {item.origin} · {dateTime.format(new Date(item.createdAt))} por {item.createdBy.name}
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="Paginação" className={styles.pagination}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                Mais recentes
              </button>
              <p>
                Página {page} de {totalPages}
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page >= totalPages}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Mais antigas
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
