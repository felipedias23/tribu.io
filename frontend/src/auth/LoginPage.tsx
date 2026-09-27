import { Link, useLocation, useNavigate } from 'react-router';
import { TextField } from '../shared/components/TextField';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { useAuth } from './AuthContext';
import styles from './AuthForm.module.css';
import { useFormSubmit } from './useFormSubmit';

export function LoginPage() {
  useDocumentTitle('Entrar');
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const { submitting, onSubmit, formError, fieldErrors } = useFormSubmit(async (form) => {
    await login({ email: String(form.get('email')), password: String(form.get('password')) });
    navigate(from, { replace: true });
  });

  return (
    <>
      <h1 className={styles.title}>Entrar</h1>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && (
          <p role="alert" className={styles.alert}>
            {formError}
          </p>
        )}
        <TextField label="Email" name="email" type="email" autoComplete="email" required errors={fieldErrors('email')} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={fieldErrors('password')}
        />
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'A entrar…' : 'Entrar'}
        </button>
      </form>
      <p className={styles.footer}>
        Ainda não tem conta? <Link to="/register">Registe o seu escritório</Link>
      </p>
    </>
  );
}
