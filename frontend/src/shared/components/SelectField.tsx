import { useId, type SelectHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  errors?: string[];
  /** Ajuda mostrada por baixo do campo e lida pelos leitores de ecrã. */
  hint?: string;
}

/** Lista de opções com rótulo e mensagens de erro acessíveis (como o TextField). */
export function SelectField({ label, options, errors = [], hint, ...selectProps }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = errors.length > 0;
  const describedBy = [hint && hintId, invalid && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {invalid && (
        <p id={errorId} className={styles.error}>
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
