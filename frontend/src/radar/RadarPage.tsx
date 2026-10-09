import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { formatCnpj } from '../companies/cnpj';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { getRadarSummary, listRadar, RADAR_STATUSES, type RadarItem, type RadarStatus, radarKeys } from './api';
import { fractionToPercent, STATUS_LABELS } from './format';
import styles from './Radar.module.css';

function parseStatus(value: string | null): RadarStatus | null {
  return RADAR_STATUSES.find((status) => status === value) ?? null;
}

function Result({ item }: { item: RadarItem }) {
  if (!item.result) return <span className={styles.missing}>Sem cálculo</span>;
  const { fatorR, annex, effectiveRate } = item.result;
  return (
    <>
      Fator R {fractionToPercent(fatorR)} · Anexo {annex} · alíquota efetiva {fractionToPercent(effectiveRate)}
    </>
  );
}

/**
 * Tax Radar (US10): a carteira por prioridade, com o motivo de cada sinal. O
 * estado é calculado pela API a cada pedido (D26). O filtro e a página ficam
 * no URL.
 */
export function RadarPage() {
  useDocumentTitle('Tax Radar');
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);

  const summary = useQuery({ queryKey: radarKeys.summary(), queryFn: getRadarSummary });
  const list = useQuery({
    queryKey: radarKeys.list({ status, page }),
    queryFn: () => listRadar({ status, page }),
    placeholderData: keepPreviousData,
  });

  function filterBy(next: RadarStatus | null) {
    setParams(next ? { status: next } : {});
  }

  function goToPage(next: number) {
    setParams({ ...(status && { status }), page: String(next) });
  }

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        Tax Radar
      </h1>
      <p className={styles.hint}>
        Onde olhar primeiro na carteira. Os estados são sinais para o contador, não decisões tributárias.
      </p>

      <nav aria-label="Filtrar por estado" className={styles.summary}>
        <button
          type="button"
          className={styles.filter}
          aria-pressed={status === null}
          onClick={() => filterBy(null)}
        >
          Todas <strong>{summary.data?.total ?? '…'}</strong>
        </button>
        {RADAR_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.filter}
            data-status={value}
            aria-pressed={status === value}
            onClick={() => filterBy(value)}
          >
            {STATUS_LABELS[value]} <strong>{summary.data?.counts[value] ?? '…'}</strong>
          </button>
        ))}
      </nav>

      {list.isPending && <p role="status">A calcular o Radar…</p>}
      {(list.isError || summary.isError) && (
        <p role="alert" className={styles.alert}>
          {(list.error ?? summary.error)?.message}
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className={styles.empty}>
          {status
            ? `Nenhuma empresa no estado "${STATUS_LABELS[status]}".`
            : 'Ainda não há empresas na carteira.'}
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <table className={styles.table}>
            <caption className="visually-hidden">Empresas por prioridade</caption>
            <thead>
              <tr>
                <th scope="col">Empresa</th>
                <th scope="col">Estado</th>
                <th scope="col">Motivo</th>
                <th scope="col">Cálculo</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.company.id}>
                  <td data-label="Empresa">
                    <Link to={`/companies/${item.company.id}`}>{item.company.legalName}</Link>
                    <span className={styles.cnpj}>{formatCnpj(item.company.cnpj)}</span>
                  </td>
                  <td data-label="Estado">
                    <span className={styles.badge} data-status={item.status}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td data-label="Motivo">
                    <ul className={styles.reasons}>
                      {item.reasons.map((reason) => (
                        <li key={reason.code}>{reason.message}</li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="Cálculo">
                    <Result item={item} />
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
