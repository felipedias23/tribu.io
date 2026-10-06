import { useState } from 'react';
import { TextField } from '../shared/components/TextField';
import { useFormSubmit } from '../shared/hooks/useFormSubmit';
import type { CompanyInput } from './api';
import { formatCnpj } from './cnpj';
import styles from './Companies.module.css';

interface CompanyFormProps {
  initial?: CompanyInput;
  submitLabel: string;
  onSubmit(input: CompanyInput): Promise<void>;
  onCancel?(): void;
}

/** Formulário de cadastro e edição. Os erros por campo vêm da API. */
export function CompanyForm({ initial, submitLabel, onSubmit, onCancel }: CompanyFormProps) {
  const [cnpj, setCnpj] = useState(formatCnpj(initial?.cnpj ?? ''));

  const { submitting, onSubmit: handleSubmit, formError, fieldErrors } = useFormSubmit(async (form) => {
    const tradeName = String(form.get('tradeName')).trim();
    await onSubmit({
      cnpj,
      legalName: String(form.get('legalName')),
      tradeName: tradeName === '' ? null : tradeName,
    });
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError && (
        <p role="alert" className={styles.alert}>
          {formError}
        </p>
      )}
      <TextField
        label="CNPJ"
        name="cnpj"
        value={cnpj}
        onChange={(event) => setCnpj(formatCnpj(event.target.value))}
        placeholder="00.000.000/0000-00"
        autoCapitalize="characters"
        spellCheck={false}
        required
        errors={fieldErrors('cnpj')}
      />
      <TextField
        label="Razão social"
        name="legalName"
        defaultValue={initial?.legalName}
        maxLength={150}
        required
        errors={fieldErrors('legalName')}
      />
      <TextField
        label="Nome fantasia (opcional)"
        name="tradeName"
        defaultValue={initial?.tradeName ?? ''}
        maxLength={150}
        errors={fieldErrors('tradeName')}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? 'A guardar…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
