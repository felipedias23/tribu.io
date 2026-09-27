import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import styles from './AppLayout.module.css';
import { navItemsFor } from './navigation';
import { UserMenu } from './UserMenu';

const NAV_ID = 'main-navigation';
const MAIN_ID = 'main-content';

/**
 * Layout das páginas autenticadas (mobile-first): no telemóvel a navegação é
 * um painel aberto pelo botão Menu; a partir de 48rem fica fixa à esquerda.
 */
export function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  function closeMenu({ returnFocus }: { returnFocus: boolean }) {
    setMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }

  // Ao abrir, o foco vai para a primeira secção; Escape fecha e devolve o foco ao botão.
  useEffect(() => {
    if (!menuOpen) return;
    navRef.current?.querySelector<HTMLElement>('a')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  function onNavigate() {
    setMenuOpen(false);
    mainRef.current?.focus();
  }

  if (!user) return null;

  return (
    <div className={styles.shell}>
      <a href={`#${MAIN_ID}`} className={styles.skipLink}>
        Saltar para o conteúdo
      </a>

      <header className={styles.header}>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls={NAV_ID}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" className={styles.menuIcon} />
          Menu
        </button>
        <Link to="/radar" className={styles.brand}>
          Tribu.io
        </Link>
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav
          ref={navRef}
          id={NAV_ID}
          aria-label="Navegação principal"
          className={styles.nav}
          data-open={menuOpen}
        >
          <ul className={styles.navList}>
            {navItemsFor(user.role).map((item) => (
              <li key={item.path}>
                <NavLink to={item.path} className={styles.navLink} onClick={onNavigate}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {menuOpen && (
          <div className={styles.backdrop} aria-hidden="true" onClick={() => closeMenu({ returnFocus: true })} />
        )}

        <main ref={mainRef} id={MAIN_ID} tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
