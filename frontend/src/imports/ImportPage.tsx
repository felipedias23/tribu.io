import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { companyKeys } from '../companies/api';
import { formatCnpj } from '../companies/cnpj';
import { radarKeys } from '../radar/api';
import { ApiError } from '../shared/api/http';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import {
  cancelImport,
  confirmImport,
  getImport,
  type ImportDetail,
  type ImportOutcome,
  type ImportRow,
  importKeys,
} from './api';
import { FIELD_LABELS, formatValue, OUTCOME_LABELS, STATUS_LABELS } from './format';
import styles from './Imports.module.css';
import { canImport } from './permissions';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Ordem das secções: primeiro o que precisa de atenção (D36). */
const SECTIONS: ImportOutcome[] = ['CONFLICT', 'ERROR', 'NEW', 'UPDATED', 'UNCHANGED'];

function rowTitle(row: ImportRow): string {
  const name = row.legalName ?? 'Sem razão social';
  return row.cnpj ? `${name} · ${formatCnpj(row.cnpj)}` : name;
}

function RowDetails({ row }: { row: ImportRow }) {
  if (row.outcome === 'CONFLICT') return <p className={styles.meta}>{row.reason}</p>;
  if (row.outcome === 'ERROR') {
    return (
      <ul className={styles.details}>
        {row.errors.map((error) => (
          <li key={error.column}>
            <code>{error.column}</code>: {error.message}
          </li>
        ))}
      </ul>
    );
  }
  if (row.outcome === 'UPDATED') {
    return (
      <ul className={styles.details}>
        {row.changes.map((change) => (
          <li key={change.field}>
            {FIELD_LABELS[change.field] ?? change.field}: {formatValue(change.field, change.before)} →{' '}
            {formatValue(change.field, change.after)}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

/** Prévia de uma importação (US12, US13, D36, D37) ou o resumo, depois de fechada. */
export function ImportPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: importKeys.detail(id),
    queryFn: () => getImport(id),
  });
  useDocumentTitle(data ? `Importação · ${data.fileName}` : 'Importação');

  async function act(action: (id: string) => Promise<ImportDetail>) {
    setBusy(true);
    setActionError(null);
    try {
      const closed = await action(id);
      queryClient.setQueryData(importKeys.detail(id), closed);
      await queryClient.invalidateQueries({ queryKey: importKeys.all, refetchType: 'none' });
      // A carteira mudou: a lista de empresas e o Radar (D26, D38).
      await queryClient.invalidateQueries({ queryKey: companyKeys.all, refetchType: 'none' });
      await queryClient.invalidateQueries({ queryKey: radarKeys.all, refetchType: 'none' });
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Não foi possível concluir a ação.');
      // A prévia pode ter expirado ou mudado: mostra o estado atual.
      await queryClient.invalidateQueries({ queryKey: importKeys.detail(id) });
    } finally {
      setBusy(false);
    }
  }

  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
  const editable = data?.status === 'PREVIEW' && !!user && canImport(user.role);

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <Link to="/imports" className={styles.back}>
        ← Importações
      </Link>

      {isPending && <p role="status">A carregar importação…</p>}
      {notFound && (
        <>
          <h1 id="page-title" className={styles.title}>
            Importação não encontrada
          </h1>
          <p className={styles.empty}>A importação não existe ou não pertence ao seu escritório.</p>
        </>
      )}
      {error && !notFound && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {data && (
        <>
          <div>
            <h1 id="page-title" className={styles.title}>
              {data.fileName}
            </h1>
            <p className={styles.meta}>
              {STATUS_LABELS[data.status]} · {data.origin} · enviada em {dateTime.format(new Date(data.createdAt))} por{' '}
              {data.createdBy.name}
            </p>
          </div>

          {actionError && (
            <p role="alert" className={styles.alert}>
              {actionError}
            </p>
          )}
          {data.status === 'CONFIRMED' && (
            <p role="status" className={styles.success}>
              Importação confirmada{data.closedBy && ` por ${data.closedBy.name}`}: {data.summary.new} empresas criadas e{' '}
              {data.summary.updated} atualizadas. <Link to="/radar">Ver o Tax Radar</Link>
            </p>
          )}
          {data.status === 'CANCELLED' && (
            <p className={styles.notice}>Importação cancelada: nada foi gravado.</p>
          )}
          {data.status === 'EXPIRED' && (
            <p className={styles.notice}>
              A prévia expirou (24 horas) e nada foi gravado. <Link to="/imports/new">Envie o ficheiro de novo</Link>.
            </p>
          )}

          <ul className={styles.counts} aria-label="Resumo">
            {SECTIONS.map((outcome) => (
              <li key={outcome}>
                {OUTCOME_LABELS[outcome]}: <strong>{data.summary[outcomeKey(outcome)]}</strong>
              </li>
            ))}
          </ul>
          {data.summary.ignoredColumns.length > 0 && (
            <p className={styles.hint}>Colunas ignoradas (fora do modelo): {data.summary.ignoredColumns.join(', ')}.</p>
          )}

          {data.status === 'PREVIEW' && (
            <p className={styles.hint}>
              Prévia válida até {dateTime.format(new Date(data.expiresAt))}. Ao confirmar, só as linhas novas e
              atualizadas são gravadas; conflitos e erros ficam de fora e corrigem-se no ficheiro ou na ficha da
              empresa.
            </p>
          )}
          {editable && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || data.summary.new + data.summary.updated === 0}
                onClick={() => act(confirmImport)}
              >
                {busy ? 'A gravar…' : `Confirmar (${data.summary.new + data.summary.updated} empresas)`}
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => act(cancelImport)}>
                Cancelar importação
              </button>
            </div>
          )}

          {data.rows &&
            SECTIONS.map((outcome) => {
              const rows = data.rows!.filter((row) => row.outcome === outcome);
              if (rows.length === 0) return null;
              const titleId = `section-${outcome}`;
              return (
                <section key={outcome} className={styles.section} aria-labelledby={titleId}>
                  <h2 id={titleId} className={styles.subtitle}>
                    {OUTCOME_LABELS[outcome]} ({rows.length})
                  </h2>
                  <ul className={styles.rows}>
                    {rows.map((row) => (
                      <li key={row.line}>
                        <p className={styles.rowTitle}>
                          Linha {row.line}: {rowTitle(row)}
                        </p>
                        <RowDetails row={row} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </>
      )}
    </section>
  );
}

function outcomeKey(outcome: ImportOutcome) {
  const keys = { NEW: 'new', UPDATED: 'updated', UNCHANGED: 'unchanged', CONFLICT: 'conflict', ERROR: 'error' } as const;
  return keys[outcome];
}
