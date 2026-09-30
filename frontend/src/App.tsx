import { ApiStatus } from './components/ApiStatus';
import styles from './App.module.css';

export function App() {
  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>Tribu.io</h1>
      <p className={styles.tagline}>Inteligência tributária para escritórios de contabilidade.</p>
      <ApiStatus />
    </main>
  );
}
