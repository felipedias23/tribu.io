import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRequest } from '../shared/api/http';
import { renderRoute } from '../test/render';
import { demoUser, errorResponse, server } from '../test/server';

const EXPIRED_MESSAGE = 'A sua sessão expirou. Entre novamente para continuar.';

describe('sessão expirada durante o uso', () => {
  beforeEach(() => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)));
  });

  it('um 401 da API leva ao login e, depois de entrar, volta à página de origem', async () => {
    server.use(
      http.get('/api/v1/dados', () => errorResponse(401, 'Sessão inválida ou expirada.')),
      http.post('/api/v1/auth/login', () => HttpResponse.json(demoUser)),
    );
    const { router } = renderRoute('/companies');
    await screen.findByRole('heading', { name: 'Empresas' });

    await act(() => apiRequest('/dados').catch(() => undefined));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText(EXPIRED_MESSAGE)).toHaveAttribute('role', 'status');

    await userEvent.type(screen.getByLabelText('Email'), demoUser.email);
    await userEvent.type(screen.getByLabelText('Password'), 'password-certa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Empresas' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/companies');
  });

  it('ao voltar ao separador, uma sessão já inválida leva ao login', async () => {
    const { router } = renderRoute('/radar');
    await screen.findByRole('heading', { name: 'Tax Radar' });
    server.use(http.get('/api/v1/auth/me', () => errorResponse(401, 'Sessão inválida ou expirada.')));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText(EXPIRED_MESSAGE)).toHaveAttribute('role', 'status');
  });

  it('ao voltar ao separador com a sessão válida, nada muda', async () => {
    renderRoute('/radar');
    await screen.findByRole('heading', { name: 'Tax Radar' });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByRole('heading', { name: 'Tax Radar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('um visitante sem sessão não vê o aviso de sessão expirada', async () => {
    server.use(http.get('/api/v1/auth/me', () => errorResponse(401, 'Sessão inválida ou expirada.')));
    renderRoute('/radar');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText(EXPIRED_MESSAGE)).not.toBeInTheDocument();
  });
});
