import { Link } from 'react-router';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import styles from '../shared/components/PlaceholderPage.module.css';

/** Rota desconhecida, mostrada dentro do layout autenticado. */
export function NotFoundPage() {
  useDocumentTitle('Página não encontrada');

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Página não encontrada</h1>
      <p className={styles.text}>O endereço não corresponde a nenhuma página.</p>
      <p>
        <Link to="/radar">Voltar ao Tax Radar</Link>
      </p>
    </section>
  );
}
