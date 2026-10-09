import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { companyKeys, getTaxProfile, putTaxProfile, type TaxProfile, type TaxProfileInput } from './api';
import styles from './Companies.module.css';
import { TaxProfileForm } from './TaxProfileForm';
import { formatCnae, formatMoney, formatPeriod, REGIME_LABELS } from './taxProfileFormat';
import { radarKeys } from '../radar/api';

type Field = Exclude<keyof TaxProfile, 'updatedAt'>;

const FIELDS: { key: Field; label: string; format(value: string): ReactNode }[] = [
  { key: 'taxRegime', label: 'Regime tributário', format: (v) => REGIME_LABELS[v as keyof typeof REGIME_LABELS] },
  { key: 'cnae', label: 'CNAE principal', format: formatCnae },
  { key: 'city', label: 'Município', format: (v) => v },
  { key: 'state', label: 'UF', format: (v) => v },
  { key: 'revenue12m', label: 'Receita bruta (12 meses)', format: formatMoney },
  { key: 'payroll12m', label: 'Folha de pagamento (12 meses)', format: formatMoney },
  { key: 'referencePeriod', label: 'Mês de referência', format: formatPeriod },
];

/**
 * Perfil tributário da empresa (US08). Dados ausentes ficam visíveis como
 * "Não informado": o sistema nunca os trata como zero (D20).
 */
export function TaxProfileSection({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: profile, isPending, isError, error } = useQuery({
    queryKey: companyKeys.taxProfile(companyId),
    queryFn: () => getTaxProfile(companyId),
  });

  async function onSubmit(input: TaxProfileInput) {
    const saved = await putTaxProfile(companyId, input);
    queryClient.setQueryData(companyKeys.taxProfile(companyId), saved);
    // O estado do Radar é calculado a partir destes dados (D26).
    await queryClient.invalidateQueries({ queryKey: radarKeys.all, refetchType: 'none' });
    setEditing(false);
  }

  const missing = profile ? FIELDS.filter(({ key }) => profile[key] === null) : [];

  return (
    <section className={styles.section} aria-labelledby="tax-profile-title">
      <div className={styles.header}>
        <h2 id="tax-profile-title" className={styles.subtitle}>
          Perfil tributário
        </h2>
        {profile && canEdit && !editing && (
          <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
            {profile.updatedAt ? 'Editar perfil' : 'Preencher perfil'}
          </button>
        )}
      </div>

      {isPending && <p role="status">A carregar perfil tributário…</p>}
      {isError && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {profile && editing && (
        <TaxProfileForm profile={profile} onSubmit={onSubmit} onCancel={() => setEditing(false)} />
      )}

      {profile && !editing && (
        <>
          {profile.updatedAt === null ? (
            <p className={styles.empty}>O perfil tributário ainda não foi preenchido.</p>
          ) : (
            missing.length > 0 && (
              <p className={styles.notice}>
                Dados em falta: {missing.map(({ label }) => label).join(', ')}.
              </p>
            )
          )}
          <dl className={styles.details}>
            {FIELDS.map(({ key, label, format }) => {
              const value = profile[key];
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{value === null ? <span className={styles.missing}>Não informado</span> : format(value)}</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </section>
  );
}
