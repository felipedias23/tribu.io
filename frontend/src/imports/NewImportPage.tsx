import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../shared/api/http';
import { TextField } from '../shared/components/TextField';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { createImport, DEFAULT_ORIGIN, importKeys, MAX_FILE_BYTES } from './api';
import { readAsBase64 } from './format';
import styles from './Imports.module.css';
import { canImport } from './permissions';

/** Escolha do ficheiro e da origem; a prévia abre a seguir (US12, D34, D35). */
export function NewImportPage() {
  useDocumentTitle('Nova importação');
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user && !canImport(user.role)) return <Navigate to="/imports" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Lido do próprio campo: o File do FormData pode vir de outra implementação.
    const file = fileInput.current?.files?.[0];
    setError(null);
    if (!file || file.size === 0) {
      setError('Escolha um ficheiro CSV ou XLSX.');
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError('Envie um ficheiro .csv ou .xlsx.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('O ficheiro excede o tamanho máximo de 2 MB.');
      return;
    }
    setSubmitting(true);
    try {
      const origin = String(form.get('origin') ?? '').trim() || DEFAULT_ORIGIN;
      const preview = await createImport({ fileName: file.name, contentBase64: await readAsBase64(file), origin });
      queryClient.setQueryData(importKeys.detail(preview.id), preview);
      await queryClient.invalidateQueries({ queryKey: importKeys.all, refetchType: 'none' });
      await navigate(`/imports/${preview.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível enviar o ficheiro.');
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <Link to="/imports" className={styles.back}>
        ← Importações
      </Link>
      <h1 id="page-title" className={styles.title}>
        Nova importação
      </h1>
      <p className={styles.hint}>
        Use o <a href="/modelo-importacao.csv" download>ficheiro de exemplo</a>: uma empresa por linha, com as colunas{' '}
        <code>cnpj</code> e <code>razao_social</code> obrigatórias. Até 2 MB e 2.000 linhas. Células vazias não apagam
        o que já está gravado.
      </p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {error && (
          <p role="alert" className={styles.alert}>
            {error}
          </p>
        )}
        <TextField
          label="Origem dos dados"
          name="origin"
          defaultValue={DEFAULT_ORIGIN}
          maxLength={100}
          placeholder="ex.: Sistema contábil X"
        />
        <div className={styles.fileField}>
          <label htmlFor={fileId}>Ficheiro CSV ou XLSX</label>
          <input
            id={fileId}
            ref={fileInput}
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting ? 'A ler o ficheiro…' : 'Ver prévia'}
          </button>
        </div>
      </form>
    </section>
  );
}
