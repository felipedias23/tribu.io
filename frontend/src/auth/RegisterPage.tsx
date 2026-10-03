import { Link } from 'react-router';
import { TextField } from '../shared/components/TextField';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { useAuth } from './AuthContext';
import styles from './AuthForm.module.css';
import { useFormSubmit } from './useFormSubmit';

export function RegisterPage() {
  useDocumentTitle('Registar escritório');
  const { register } = useAuth();

  const { submitting, onSubmit, formError, fieldErrors } = useFormSubmit(async (form) => {
    // O AuthLayout redireciona assim que a sessão fica ativa.
    await register({
      firmName: String(form.get('firmName')),
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
  });

  return (
    <>
      <h1 className={styles.title}>Registar escritório</h1>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && (
          <p role="alert" className={styles.alert}>
            {formError}
          </p>
        )}
        <TextField
          label="Nome do escritório"
          name="firmName"
          autoComplete="organization"
          required
          errors={fieldErrors('firmName')}
        />
        <TextField label="O seu nome" name="name" autoComplete="name" required errors={fieldErrors('name')} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required errors={fieldErrors('email')} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          errors={fieldErrors('password')}
        />
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'A registar…' : 'Criar conta'}
        </button>
      </form>
      <p className={styles.footer}>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </>
  );
}
