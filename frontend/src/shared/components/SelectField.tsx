import { useId, type SelectHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  errors?: string[];
}

/** Lista de opções com rótulo e mensagens de erro acessíveis (como o TextField). */
export function SelectField({ label, options, errors = [], ...selectProps }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = errors.length > 0;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid && (
        <p id={errorId} className={styles.error}>
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
