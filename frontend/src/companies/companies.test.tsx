import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/api';
import { renderRoute } from '../test/render';
import { demoUser, errorResponse, server } from '../test/server';
import type { Company } from './api';

const viewer: AuthUser = { ...demoUser, role: 'VIEWER', name: 'Consulta Alfa' };

const oficina: Company = {
  id: '11111111-c000-4000-8000-000000000001',
  cnpj: '12ABC34501DE35',
  legalName: 'Oficina Exemplo Ltda',
  tradeName: 'Oficina Exemplo',
  createdAt: '2026-10-03T12:00:00.000Z',
  updatedAt: '2026-10-03T12:00:00.000Z',
};

function signedInAs(user: AuthUser) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(user)));
}

function companiesPage(items: Company[], total = items.length, page = 1) {
  return HttpResponse.json({ items, total, page, pageSize: 20 });
}

describe('empresas', () => {
  it('lista as empresas e pesquisa pelo termo escrito', async () => {
    signedInAs(demoUser);
    const searches: (string | null)[] = [];
    server.use(
      http.get('/api/v1/companies', ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        searches.push(search);
        return companiesPage(search ? [] : [oficina]);
      }),
    );
    const { router } = renderRoute('/companies');

    const row = (await screen.findByRole('link', { name: 'Oficina Exemplo Ltda' })).closest('tr')!;
    expect(within(row).getByText('12.ABC.345/01DE-35')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 1 · 1 empresa')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Pesquisar empresas' }), 'padaria');
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

    expect(await screen.findByText('Nenhuma empresa encontrada para "padaria".')).toBeInTheDocument();
    expect(searches).toEqual([null, 'padaria']);
    expect(router.state.location.search).toBe('?search=padaria');
  });

  it('pagina a lista', async () => {
    signedInAs(demoUser);
    const pages: (string | null)[] = [];
    server.use(
      http.get('/api/v1/companies', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        pages.push(page);
        return companiesPage([oficina], 45, Number(page));
      }),
    );
    renderRoute('/companies');

    expect(await screen.findByText('Página 1 de 3 · 45 empresas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Seguinte' }));

    expect(await screen.findByText('Página 2 de 3 · 45 empresas')).toBeInTheDocument();
    expect(pages).toEqual(['1', '2']);
  });

  it('VIEWER consulta, mas não vê as ações de cadastrar e editar', async () => {
    signedInAs(viewer);
    server.use(
      http.get('/api/v1/companies', () => companiesPage([oficina])),
      http.get(`/api/v1/companies/${oficina.id}`, () => HttpResponse.json(oficina)),
    );
    renderRoute('/companies');

    await userEvent.click(await screen.findByRole('link', { name: 'Oficina Exemplo Ltda' }));

    expect(await screen.findByRole('heading', { name: 'Oficina Exemplo Ltda' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: '← Empresas' }));
    expect(await screen.findByRole('link', { name: 'Oficina Exemplo Ltda' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova empresa' })).not.toBeInTheDocument();
  });

  it('cadastro mostra os erros por campo e, depois de corrigido, abre a empresa criada', async () => {
    signedInAs(demoUser);
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/v1/companies', async ({ request }) => {
        const body = (await request.json()) as { cnpj: string };
        bodies.push(body);
        if (body.cnpj.endsWith('36')) {
          return errorResponse(400, 'Dados inválidos.', [{ field: 'cnpj', messages: ['Informe um CNPJ válido.'] }]);
        }
        return HttpResponse.json(oficina, { status: 201 });
      }),
    );
    const { router } = renderRoute('/companies/new');

    const cnpj = await screen.findByLabelText('CNPJ');
    await userEvent.type(cnpj, '12abc34501de36');
    expect(cnpj).toHaveValue('12.ABC.345/01DE-36');
    await userEvent.type(screen.getByLabelText('Razão social'), 'Oficina Exemplo Ltda');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Informe um CNPJ válido.')).toBeInTheDocument();
    expect(cnpj).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(cnpj);
    await userEvent.type(cnpj, '12ABC34501DE35');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('heading', { name: 'Oficina Exemplo Ltda' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/companies/${oficina.id}`);
    expect(bodies.at(-1)).toEqual({ cnpj: '12.ABC.345/01DE-35', legalName: 'Oficina Exemplo Ltda', tradeName: null });
  });

  it('edita a empresa e mostra os dados atualizados', async () => {
    signedInAs({ ...demoUser, role: 'ANALYST' });
    let patchBody: unknown;
    server.use(
      http.get(`/api/v1/companies/${oficina.id}`, () => HttpResponse.json(oficina)),
      http.patch(`/api/v1/companies/${oficina.id}`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...oficina, legalName: 'Oficina Renovada Ltda', tradeName: null });
      }),
    );
    renderRoute(`/companies/${oficina.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const legalName = screen.getByLabelText('Razão social');
    await userEvent.clear(legalName);
    await userEvent.type(legalName, 'Oficina Renovada Ltda');
    await userEvent.clear(screen.getByLabelText('Nome fantasia (opcional)'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }));

    expect(await screen.findByRole('heading', { name: 'Oficina Renovada Ltda' })).toBeInTheDocument();
    expect(screen.getByText('Nome fantasia').nextElementSibling).toHaveTextContent('Não informado');
    expect(patchBody).toEqual({ cnpj: '12.ABC.345/01DE-35', legalName: 'Oficina Renovada Ltda', tradeName: null });
  });

  it('empresa inexistente ou de outro escritório mostra "não encontrada"', async () => {
    signedInAs(demoUser);
    server.use(http.get('/api/v1/companies/:id', () => errorResponse(404, 'Empresa não encontrada.')));
    renderRoute(`/companies/${oficina.id}`);

    expect(await screen.findByRole('heading', { name: 'Empresa não encontrada' })).toBeInTheDocument();
  });

  it('limpa o cache das empresas ao sair (S24)', async () => {
    signedInAs(demoUser);
    server.use(
      http.get('/api/v1/companies', () => companiesPage([oficina])),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    const { queryClient } = renderRoute('/companies');
    await screen.findByRole('link', { name: 'Oficina Exemplo Ltda' });
    expect(queryClient.getQueryCache().getAll()).not.toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await screen.findByRole('heading', { name: 'Entrar' });
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });
});
