import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fractionToPercent } from '../radar/format';
import { radarKeys } from '../radar/api';
import { RadarStatusBadge } from '../radar/RadarStatusBadge';
import { ApiError } from '../shared/api/http';
import { analysisKeys, executeAnalysis, listAnalyses, PAGE_SIZE } from './api';
import styles from './Analyses.module.css';
import { ANALYSIS_STATUS_LABELS, formatDateTime } from './format';

/**
 * Análises da empresa (US09, US15): executar e consultar o histórico. Cada
 * execução grava um registo novo, que nunca muda.
 */
export function AnalysesSection({ companyId, canRun }: { companyId: string; canRun: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: analysisKeys.list(companyId, page),
    queryFn: () => listAnalyses(companyId, page),
  });

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      const analysis = await executeAnalysis(companyId);
      queryClient.setQueryData(analysisKeys.detail(analysis.id), analysis);
      await queryClient.invalidateQueries({ queryKey: analysisKeys.all, refetchType: 'none' });
      // O Radar mostra a última análise e compara a versão da regra (D29).
      await queryClient.invalidateQueries({ queryKey: radarKeys.all, refetchType: 'none' });
      await navigate(`/analyses/${analysis.id}`);
    } catch (caught) {
      setRunError(caught instanceof ApiError ? caught.message : 'Não foi possível executar a análise.');
      setRunning(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className={styles.section} aria-labelledby="analyses-title">
      <div className={styles.header}>
        <h2 id="analyses-title" className={styles.subtitle}>
          Análises do Fator R
        </h2>
        {canRun && (
          <button type="button" className={styles.primaryButton} disabled={running} onClick={run}>
            {running ? 'A executar…' : 'Executar análise'}
          </button>
        )}
      </div>
      <p className={styles.hint}>
        Cada análise fica gravada com os dados e a versão da regra usados, e não muda depois.
      </p>

      {runError && (
        <p role="alert" className={styles.alert}>
          {runError}
        </p>
      )}
      {isPending && <p role="status">A carregar análises…</p>}
      {isError && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {data && data.items.length === 0 && <p className={styles.empty}>Esta empresa ainda não foi analisada.</p>}

      {data && data.items.length > 0 && (
        <>
          <ul className={styles.history} aria-label="Histórico de análises">
            {data.items.map((analysis) => (
              <li key={analysis.id}>
                <Link to={`/analyses/${analysis.id}`}>{formatDateTime(analysis.executedAt)}</Link>
                <span>{ANALYSIS_STATUS_LABELS[analysis.status]}</span>
                <RadarStatusBadge status={analysis.radarStatus} />
                {analysis.result && (
                  <span>
                    Anexo {analysis.result.annex} · alíquota efetiva {fractionToPercent(analysis.result.effectiveRate)}
                  </span>
                )}
                <span className={styles.meta}>
                  por {analysis.executedBy.name}
                  {analysis.ruleVersion && ` · versão ${analysis.ruleVersion.version} da regra`}
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="Paginação das análises" className={styles.header}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Mais recentes
              </button>
              <p className={styles.meta}>
                Página {page} de {totalPages}
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
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
