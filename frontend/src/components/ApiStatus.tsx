import { useEffect, useState } from 'react';
import styles from './ApiStatus.module.css';

type Status = 'checking' | 'online' | 'offline';

const LABELS: Record<Status, string> = {
  checking: 'verificando…',
  online: 'online',
  offline: 'indisponível',
};

/** Indicador de disponibilidade da API e do banco (GET /api/v1/health). */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health', { signal: controller.signal })
      .then((response) => setStatus(response.ok ? 'online' : 'offline'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('offline');
      });
    return () => controller.abort();
  }, []);

  return (
    <span className={styles.status} data-state={status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      API {LABELS[status]}
    </span>
  );
}
