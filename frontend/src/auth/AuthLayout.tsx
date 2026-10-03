import { Navigate, Outlet, useLocation } from 'react-router';
import { ApiStatus } from '../components/ApiStatus';
import { useAuth } from './AuthContext';
import styles from './AuthLayout.module.css';

/**
 * Layout das páginas públicas. Com sessão (já existente ou acabada de iniciar
 * no login/registo), segue para a página de origem guardada pelo RequireAuth,
 * ou para a página inicial.
 */
export function AuthLayout() {
  const { status } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  if (status === 'loading') {
    return <p role="status">A verificar a sessão…</p>;
  }
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }
  return (
    <div className={styles.wrapper}>
      <main className={styles.card}>
        <p className={styles.brand}>Tribu.io</p>
        <Outlet />
      </main>
      <ApiStatus />
    </div>
  );
}
