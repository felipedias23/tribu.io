import { Navigate, Outlet } from 'react-router';
import { ApiStatus } from '../components/ApiStatus';
import { useAuth } from './AuthContext';
import styles from './AuthLayout.module.css';

/** Layout das páginas públicas. Quem já tem sessão vai para a página inicial. */
export function AuthLayout() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <p role="status">A verificar a sessão…</p>;
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
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
