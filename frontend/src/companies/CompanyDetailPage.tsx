import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../shared/api/http';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { companyKeys, getCompany, updateCompany, type CompanyInput } from './api';
import { formatCnpj } from './cnpj';
import styles from './Companies.module.css';
import { CompanyForm } from './CompanyForm';
import { canEditCompanies } from './permissions';
import { TaxProfileSection } from './TaxProfileSection';
import { radarKeys } from '../radar/api';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/** Dados de uma empresa e edição (US06), com o perfil tributário (US08). */
export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: company, isPending, error } = useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => getCompany(id),
  });
  useDocumentTitle(company?.legalName ?? 'Empresa');

  async function onSubmit(input: CompanyInput) {
    const updated = await updateCompany(id, input);
    queryClient.setQueryData(companyKeys.detail(id), updated);
    await queryClient.invalidateQueries({ queryKey: companyKeys.all, refetchType: 'none' });
    // O estado do Radar é calculado a partir destes dados (D26).
    await queryClient.invalidateQueries({ queryKey: radarKeys.all, refetchType: 'none' });
    setEditing(false);
  }

  // 400 (ID que não é UUID) e 404 (inexistente ou de outro escritório) são tratados igual.
  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <Link to="/companies" className={styles.back}>
        ← Empresas
      </Link>

      {isPending && <p role="status">A carregar empresa…</p>}
      {notFound && (
        <>
          <h1 id="page-title" className={styles.title}>
            Empresa não encontrada
          </h1>
          <p className={styles.empty}>A empresa não existe ou não pertence ao seu escritório.</p>
        </>
      )}
      {error && !notFound && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {company && (
        <>
          <div className={styles.header}>
            <h1 id="page-title" className={styles.title}>
              {company.legalName}
            </h1>
            {!editing && user && canEditCompanies(user.role) && (
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
          </div>

          {editing ? (
            <CompanyForm
              initial={company}
              submitLabel="Guardar alterações"
              onSubmit={onSubmit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <dl className={styles.details}>
              <div>
                <dt>CNPJ</dt>
                <dd className={styles.cnpj}>{formatCnpj(company.cnpj)}</dd>
              </div>
              <div>
                <dt>Nome fantasia</dt>
                <dd>{company.tradeName ?? <span className={styles.missing}>Não informado</span>}</dd>
              </div>
              <div>
                <dt>Cadastrada em</dt>
                <dd>{dateFormat.format(new Date(company.createdAt))}</dd>
              </div>
            </dl>
          )}

          <TaxProfileSection companyId={company.id} canEdit={!!user && canEditCompanies(user.role)} />
        </>
      )}
    </section>
  );
}
