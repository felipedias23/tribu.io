import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './PlaceholderPage.module.css';

/**
 * Secção prevista no mapa de rotas mas ainda não implementada. Não mostra
 * dados nem regras de negócio: é substituída pelo módulo correspondente.
 */
export function PlaceholderPage({ title }: { title: string }) {
  useDocumentTitle(title);

  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        {title}
      </h1>
      <p className={styles.badge}>Em construção</p>
      <p className={styles.text}>Esta secção será disponibilizada numa próxima etapa do desenvolvimento.</p>
    </section>
  );
}
