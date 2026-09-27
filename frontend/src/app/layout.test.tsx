import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { demoUser, server } from '../test/server';

const SECTIONS = ['Tax Radar', 'Empresas', 'Importações', 'Auditoria', 'Configurações'];

function mainNav() {
  return screen.getByRole('navigation', { name: 'Navegação principal' });
}

describe('layout autenticado', () => {
  beforeEach(() => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)));
  });

  it('a raiz redireciona para o Tax Radar dentro do layout', async () => {
    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Tax Radar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/radar');
    expect(mainNav()).toBeInTheDocument();
    expect(document.title).toBe('Tax Radar · Tribu.io');
  });

  it('mostra as cinco secções, com a atual marcada por aria-current', async () => {
    renderRoute('/imports');
    await screen.findByRole('heading', { name: 'Importações' });

    const links = within(mainNav()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(SECTIONS);
    expect(within(mainNav()).getByRole('link', { name: 'Importações' })).toHaveAttribute('aria-current', 'page');
    expect(within(mainNav()).getByRole('link', { name: 'Tax Radar' })).not.toHaveAttribute('aria-current');
  });

  it('navega entre secções e atualiza o título do separador', async () => {
    const { router } = renderRoute('/radar');
    await screen.findByRole('heading', { name: 'Tax Radar' });

    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Empresas' }));

    expect(await screen.findByRole('heading', { name: 'Empresas' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/companies');
    expect(document.title).toBe('Empresas · Tribu.io');
  });

  it('as secções provisórias estão identificadas como "Em construção"', async () => {
    renderRoute('/audit');

    expect(await screen.findByRole('heading', { name: 'Auditoria' })).toBeInTheDocument();
    expect(screen.getByText('Em construção')).toBeInTheDocument();
  });

  it('Configurações aceita subrotas (/settings/*)', async () => {
    renderRoute('/settings/qualquer');

    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: 'Configurações' })).toHaveAttribute('aria-current', 'page');
  });

  it('mostra no cabeçalho o utilizador, o escritório e o papel', async () => {
    renderRoute('/radar');
    const header = await screen.findByRole('banner');

    expect(within(header).getByText('Admin Alfa')).toBeInTheDocument();
    expect(within(header).getByText('Alfa Contabilidade · Administrador')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('rota desconhecida mostra a página 404 dentro do layout', async () => {
    renderRoute('/rota-inexistente');

    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(mainNav()).toBeInTheDocument();
    expect(document.title).toBe('Página não encontrada · Tribu.io');
  });

  it('o link "Saltar para o conteúdo" aponta para a área principal', async () => {
    renderRoute('/radar');
    await screen.findByRole('heading', { name: 'Tax Radar' });

    const skipLink = screen.getByRole('link', { name: 'Saltar para o conteúdo' });
    const main = screen.getByRole('main');
    expect(skipLink).toHaveAttribute('href', `#${main.id}`);
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});

describe('menu móvel', () => {
  beforeEach(() => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)));
  });

  async function openMenu() {
    renderRoute('/radar');
    const button = await screen.findByRole('button', { name: 'Menu' });
    await userEvent.click(button);
    return button;
  }

  it('o botão controla a navegação com aria-expanded e aria-controls', async () => {
    renderRoute('/radar');
    const button = await screen.findByRole('button', { name: 'Menu' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', mainNav().id);

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(mainNav()).toHaveAttribute('data-open', 'true');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('ao abrir, o foco vai para a primeira secção', async () => {
    await openMenu();

    expect(within(mainNav()).getByRole('link', { name: 'Tax Radar' })).toHaveFocus();
  });

  it('Escape fecha o menu e devolve o foco ao botão', async () => {
    const button = await openMenu();

    await userEvent.keyboard('{Escape}');

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('escolher uma secção fecha o menu e move o foco para o conteúdo', async () => {
    const button = await openMenu();

    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Auditoria' }));

    expect(await screen.findByRole('heading', { name: 'Auditoria' })).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
