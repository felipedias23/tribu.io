import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/roles';
import styles from './UserMenu.module.css';

/** Utilizador da sessão (nome, escritório, papel) e botão Sair. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.user}>
      <div className={styles.identity}>
        <span className={styles.name}>{user.name}</span>
        <span className={styles.meta}>
          {user.accountingFirm.name} · {ROLE_LABELS[user.role]}
        </span>
      </div>
      <button type="button" className={styles.logout} onClick={() => void handleLogout()}>
        Sair
      </button>
    </div>
  );
}
