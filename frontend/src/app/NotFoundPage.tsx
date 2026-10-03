import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main style={{ padding: 'var(--space-6) var(--space-4)' }}>
      <h1>Página não encontrada</h1>
      <Link to="/">Voltar ao início</Link>
    </main>
  );
}
