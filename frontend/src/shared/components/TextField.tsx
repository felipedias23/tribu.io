import { useId, type InputHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errors?: string[];
}

/** Campo de formulário com rótulo e mensagens de erro acessíveis. */
export function TextField({ label, errors = [], ...inputProps }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = errors.length > 0;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        {...inputProps}
      />
      {invalid && (
        <p id={errorId} className={styles.error}>
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
