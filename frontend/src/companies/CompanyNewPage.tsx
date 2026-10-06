import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { companyKeys, createCompany, type CompanyInput } from './api';
import styles from './Companies.module.css';
import { CompanyForm } from './CompanyForm';
import { canEditCompanies } from './permissions';

/** Cadastro de uma empresa (US06). */
export function CompanyNewPage() {
  useDocumentTitle('Nova empresa');
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(input: CompanyInput) {
    const company = await createCompany(input);
    queryClient.setQueryData(companyKeys.detail(company.id), company);
    await queryClient.invalidateQueries({ queryKey: companyKeys.all, refetchType: 'none' });
    await navigate(`/companies/${company.id}`);
  }

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <Link to="/companies" className={styles.back}>
        ← Empresas
      </Link>
      <h1 id="page-title" className={styles.title}>
        Nova empresa
      </h1>
      {user && canEditCompanies(user.role) ? (
        <CompanyForm submitLabel="Cadastrar" onSubmit={onSubmit} onCancel={() => void navigate('/companies')} />
      ) : (
        <p className={styles.empty}>O seu papel permite apenas consultar empresas.</p>
      )}
    </section>
  );
}
