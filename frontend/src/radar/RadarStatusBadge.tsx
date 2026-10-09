import type { RadarStatus } from './api';
import { STATUS_LABELS } from './format';
import styles from './Radar.module.css';

/** Estado do Radar com o nome escrito: a cor nunca é a única pista. */
export function RadarStatusBadge({ status }: { status: RadarStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
