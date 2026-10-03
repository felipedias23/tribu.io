import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, navItemsFor, type NavItem } from './navigation';

describe('navItemsFor', () => {
  it('sem restrições aprovadas, todos os papéis veem as mesmas secções', () => {
    expect(navItemsFor('ADMIN')).toEqual(NAV_ITEMS);
    expect(navItemsFor('ANALYST')).toEqual(NAV_ITEMS);
    expect(navItemsFor('VIEWER')).toEqual(NAV_ITEMS);
  });

  it('respeita `roles` quando uma secção o definir', () => {
    const items: NavItem[] = [
      { label: 'Todos', path: '/a' },
      { label: 'Só ADMIN', path: '/b', roles: ['ADMIN'] },
    ];

    expect(navItemsFor('VIEWER', items).map((item) => item.label)).toEqual(['Todos']);
    expect(navItemsFor('ADMIN', items).map((item) => item.label)).toEqual(['Todos', 'Só ADMIN']);
  });
});
