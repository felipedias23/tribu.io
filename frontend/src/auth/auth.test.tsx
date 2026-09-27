import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { demoUser, errorResponse, server } from '../test/server';

describe('autenticação', () => {
  it('sem sessão, uma rota protegida redireciona para o login', async () => {
    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('restaura a sessão existente a partir de /auth/me', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)));

    renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Admin Alfa' })).toBeInTheDocument();
    expect(screen.getByText('Alfa Contabilidade · Administrador')).toBeInTheDocument();
  });

  it('login com sucesso abre a página inicial', async () => {
    let body: unknown;
    server.use(
      http.post('/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(demoUser);
      }),
    );
    const { router } = renderRoute('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'admin@alfa.tribu.example');
    await userEvent.type(screen.getByLabelText('Password'), 'password-certa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Olá, Admin Alfa' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(body).toEqual({ email: 'admin@alfa.tribu.example', password: 'password-certa' });
  });

  it('credenciais inválidas mostram a mensagem da API', async () => {
    server.use(http.post('/api/v1/auth/login', () => errorResponse(401, 'Email ou password incorretos.')));
    renderRoute('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'admin@alfa.tribu.example');
    await userEvent.type(screen.getByLabelText('Password'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou password incorretos.');
  });

  it('registo mostra os erros de validação junto de cada campo', async () => {
    server.use(
      http.post('/api/v1/auth/register', () =>
        errorResponse(400, 'Dados inválidos.', [
          { field: 'email', messages: ['Informe um email válido.'] },
          { field: 'password', messages: ['A password deve ter entre 8 e 128 caracteres.'] },
        ]),
      ),
    );
    renderRoute('/register');

    await userEvent.click(await screen.findByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Informe um email válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('A password deve ter entre 8 e 128 caracteres.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('registo com sucesso inicia sessão', async () => {
    server.use(http.post('/api/v1/auth/register', () => HttpResponse.json(demoUser, { status: 201 })));
    renderRoute('/register');

    await userEvent.type(await screen.findByLabelText('Nome do escritório'), 'Alfa Contabilidade');
    await userEvent.type(screen.getByLabelText('O seu nome'), 'Admin Alfa');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@alfa.tribu.example');
    await userEvent.type(screen.getByLabelText('Password'), 'password-longa');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { name: 'Olá, Admin Alfa' })).toBeInTheDocument();
  });

  it('sair termina a sessão e volta ao login', async () => {
    let loggedOut = false;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)),
      http.post('/api/v1/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(loggedOut).toBe(true);
  });

  it('com sessão, o login redireciona para a página inicial', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(demoUser)));
    const { router } = renderRoute('/login');

    expect(await screen.findByRole('heading', { name: 'Olá, Admin Alfa' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
