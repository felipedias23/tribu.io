import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import styles from './HomePage.module.css';

const ROLE_LABELS = { ADMIN: 'Administrador', ANALYST: 'Analista', VIEWER: 'Consulta' } as const;

/**
 * Página inicial autenticada, provisória: confirma a sessão e permite sair.
 * O layout base e os módulos de negócio substituem-na nas próximas etapas.
 */
export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className={styles.page}>
      <h1>Olá, {user.name}</h1>
      <p className={styles.muted}>
        {user.accountingFirm.name} · {ROLE_LABELS[user.role]}
      </p>
      <button type="button" className={styles.logout} onClick={() => void handleLogout()}>
        Sair
      </button>
    </main>
  );
}
