import { Link } from 'react-router';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';

/** Rota desconhecida, mostrada dentro do layout autenticado. */
export function NotFoundPage() {
  useDocumentTitle('Página não encontrada');

  return (
    <section>
      <h1>Página não encontrada</h1>
      <p>O endereço não corresponde a nenhuma página.</p>
      <Link to="/radar">Voltar ao Tax Radar</Link>
    </section>
  );
}
