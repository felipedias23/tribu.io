import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import styles from './ErrorPage.module.css';

/**
 * Erro inesperado ao renderizar uma página. Não mostra detalhes técnicos ao
 * utilizador; o erro fica apenas na consola do browser.
 */
export function ErrorPage() {
  const error = useRouteError();
  useDocumentTitle('Erro');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <h1>Ocorreu um erro inesperado</h1>
      <p>Tente novamente. Se o problema continuar, contacte o suporte.</p>
      {/* Link normal (recarrega a aplicação), para sair de um estado inconsistente. */}
      <a href="/radar">Voltar ao início</a>
    </main>
  );
}
