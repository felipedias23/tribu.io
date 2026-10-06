import { useState } from 'react';
import { SelectField } from '../shared/components/SelectField';
import { TextField } from '../shared/components/TextField';
import { useFormSubmit } from '../shared/hooks/useFormSubmit';
import type { TaxProfile, TaxProfileInput, TaxRegime } from './api';
import styles from './Companies.module.css';
import { formatCnae, inputToMoney, moneyToInput, REGIME_LABELS, STATES } from './taxProfileFormat';

const NOT_INFORMED = { value: '', label: 'Não informado' };

interface TaxProfileFormProps {
  profile: TaxProfile;
  onSubmit(input: TaxProfileInput): Promise<void>;
  onCancel(): void;
}

/** Campo vazio é enviado como null: dado ausente, nunca zero (D20). */
export function TaxProfileForm({ profile, onSubmit, onCancel }: TaxProfileFormProps) {
  const [cnae, setCnae] = useState(formatCnae(profile.cnae ?? ''));

  const { submitting, onSubmit: handleSubmit, formError, fieldErrors } = useFormSubmit(async (form) => {
    const text = (name: string) => String(form.get(name) ?? '').trim() || null;
    await onSubmit({
      taxRegime: text('taxRegime') as TaxRegime | null,
      cnae: cnae.trim() || null,
      city: text('city'),
      state: text('state'),
      revenue12m: inputToMoney(String(form.get('revenue12m'))),
      payroll12m: inputToMoney(String(form.get('payroll12m'))),
      referencePeriod: text('referencePeriod'),
    });
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p className={styles.hint}>Deixe em branco o que não souber: o campo fica como dado ausente, não como zero.</p>
      {formError && (
        <p role="alert" className={styles.alert}>
          {formError}
        </p>
      )}
      <SelectField
        label="Regime tributário"
        name="taxRegime"
        defaultValue={profile.taxRegime ?? ''}
        options={[
          NOT_INFORMED,
          ...Object.entries(REGIME_LABELS).map(([value, label]) => ({ value, label })),
        ]}
        errors={fieldErrors('taxRegime')}
      />
      <TextField
        label="CNAE principal"
        name="cnae"
        value={cnae}
        onChange={(event) => setCnae(formatCnae(event.target.value))}
        placeholder="0000-0/00"
        inputMode="numeric"
        errors={fieldErrors('cnae')}
      />
      <TextField
        label="Município"
        name="city"
        defaultValue={profile.city ?? ''}
        maxLength={100}
        errors={fieldErrors('city')}
      />
      <SelectField
        label="UF"
        name="state"
        defaultValue={profile.state ?? ''}
        options={[NOT_INFORMED, ...STATES.map((state) => ({ value: state, label: state }))]}
        errors={fieldErrors('state')}
      />
      <TextField
        label="Receita bruta dos últimos 12 meses (R$)"
        name="revenue12m"
        defaultValue={moneyToInput(profile.revenue12m)}
        inputMode="decimal"
        placeholder="0,00"
        errors={fieldErrors('revenue12m')}
      />
      <TextField
        label="Folha de pagamento dos últimos 12 meses (R$)"
        name="payroll12m"
        defaultValue={moneyToInput(profile.payroll12m)}
        inputMode="decimal"
        placeholder="0,00"
        errors={fieldErrors('payroll12m')}
      />
      <TextField
        label="Mês de referência"
        name="referencePeriod"
        type="month"
        defaultValue={profile.referencePeriod ?? ''}
        errors={fieldErrors('referencePeriod')}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? 'A guardar…' : 'Guardar perfil'}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
