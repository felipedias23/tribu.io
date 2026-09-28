import type { UserRole } from '../auth/api';

export interface NavItem {
  label: string;
  path: string;
  /**
   * Papéis que veem a secção; ausente = todos. Nenhuma restrição está aprovada
   * ainda (decisão 2a): cada secção recebe `roles` quando a sua regra for definida.
   */
  roles?: readonly UserRole[];
}

/** Secções principais (docs/arquitetura-e-decisoes.md §6). */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tax Radar', path: '/radar' },
  { label: 'Empresas', path: '/companies' },
  { label: 'Importações', path: '/imports' },
  { label: 'Auditoria', path: '/audit' },
  { label: 'Configurações', path: '/settings' },
];

export function navItemsFor(role: UserRole, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}
