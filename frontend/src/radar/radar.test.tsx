import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/api';
import { renderRoute } from '../test/render';
import { demoUser, emptyRadarSummary, errorResponse, server } from '../test/server';
import type { RadarItem } from './api';

const viewer: AuthUser = { ...demoUser, role: 'VIEWER', name: 'Consulta Alfa' };

const oportunidade: RadarItem = {
  company: { id: '11111111-c000-4000-8000-000000000011', cnpj: '12ABC34501DE35', legalName: 'Agência Fictícia de Viagens Ltda', tradeName: null },
  status: 'OPORTUNIDADE_PARA_AVALIAR',
  priorityScore: 3989,
  reasons: [
    {
      code: 'NEAR_THRESHOLD_BELOW',
      message: 'Fator R de 27,00%, a 1,00 p.p. do limiar de 28,00%: com mais folha, a empresa pode passar ao Anexo III.',
    },
  ],
  ruleVersion: { id: 'f0000000-0000-4000-8000-000000000101', version: 1, evaluatorKey: 'SIMPLES_FATOR_R@1' },
  lastAnalysis: { id: 'aaaaaaaa-0000-4000-8000-000000000001', status: 'COMPLETED', executedAt: '2026-10-09T20:16:41.513Z' },
  result: { fatorR: '0.27', annex: 'V', bracket: 4, effectiveRate: '0.1908' },
};

const semPerfil: RadarItem = {
  company: { id: '11111111-c000-4000-8000-000000000005', cnpj: '11222333000181', legalName: 'Consultoria Demonstração Ltda', tradeName: null },
  status: 'DADOS_INCOMPLETOS',
  priorityScore: 1000,
  reasons: [{ code: 'NO_PROFILE', message: 'A empresa ainda não tem perfil tributário.' }],
  ruleVersion: null,
  lastAnalysis: null,
  result: null,
};

const summary = {
  total: 2,
  counts: { ...emptyRadarSummary.counts, OPORTUNIDADE_PARA_AVALIAR: 1, DADOS_INCOMPLETOS: 1 },
};

function signedInAs(user: AuthUser) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(user)));
}

function radarPage(items: RadarItem[], total = items.length, page = 1) {
  return HttpResponse.json({ items, total, page, pageSize: 20 });
}

describe('Tax Radar', () => {
  it('mostra cada empresa com o estado, o motivo e o cálculo', async () => {
    signedInAs(viewer);
    server.use(
      http.get('/api/v1/radar', () => radarPage([oportunidade, semPerfil])),
      http.get('/api/v1/radar/summary', () => HttpResponse.json(summary)),
    );
    renderRoute('/radar');

    const row = (await screen.findByRole('link', { name: 'Agência Fictícia de Viagens Ltda' })).closest('tr')!;
    expect(within(row).getByText('Oportunidade para avaliar')).toBeInTheDocument();
    expect(within(row).getByText(oportunidade.reasons[0].message)).toBeInTheDocument();
    expect(within(row).getByText('Fator R 27,00% · Anexo V · alíquota efetiva 19,08%')).toBeInTheDocument();
    expect(within(row).getByText('12.ABC.345/01DE-35')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: oportunidade.company.legalName })).toHaveAttribute(
      'href',
      `/companies/${oportunidade.company.id}`,
    );

    const empty = screen.getByRole('link', { name: 'Consultoria Demonstração Ltda' }).closest('tr')!;
    expect(within(empty).getByText('Dados incompletos')).toBeInTheDocument();
    expect(within(empty).getByText('Sem cálculo')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Última análise/ })).toHaveAttribute(
      'href',
      '/analyses/aaaaaaaa-0000-4000-8000-000000000001',
    );
    expect(within(empty).queryByRole('link', { name: /Última análise/ })).not.toBeInTheDocument();
    expect(screen.getByText('Página 1 de 1 · 2 empresas')).toBeInTheDocument();
  });

  it('mantém a ordem de prioridade da API', async () => {
    signedInAs(viewer);
    server.use(http.get('/api/v1/radar', () => radarPage([oportunidade, semPerfil])));
    renderRoute('/radar');

    await screen.findByRole('link', { name: 'Agência Fictícia de Viagens Ltda' });
    const names = within(screen.getByRole('table'))
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((name) => !name?.startsWith('Última análise'));
    expect(names).toEqual(['Agência Fictícia de Viagens Ltda', 'Consultoria Demonstração Ltda']);
  });

  it('o resumo conta por estado e filtra a lista, com o filtro no URL', async () => {
    signedInAs(viewer);
    const requested: (string | null)[] = [];
    server.use(
      http.get('/api/v1/radar', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        requested.push(status);
        return radarPage(status ? [semPerfil] : [oportunidade, semPerfil]);
      }),
      http.get('/api/v1/radar/summary', () => HttpResponse.json(summary)),
    );
    const { router } = renderRoute('/radar');

    const filters = await screen.findByRole('navigation', { name: 'Filtrar por estado' });
    const all = await within(filters).findByRole('button', { name: 'Todas 2' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(within(filters).getByRole('button', { name: 'Requer análise 0' })).toBeInTheDocument();

    await userEvent.click(within(filters).getByRole('button', { name: 'Dados incompletos 1' }));

    await waitFor(() => expect(screen.queryByText('Agência Fictícia de Viagens Ltda')).not.toBeInTheDocument());
    expect(within(filters).getByRole('button', { name: 'Dados incompletos 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toBe('?status=DADOS_INCOMPLETOS');
    expect(requested).toEqual([null, 'DADOS_INCOMPLETOS']);
  });

  it('abre já filtrado a partir do URL e ignora estados desconhecidos', async () => {
    signedInAs(viewer);
    const requested: (string | null)[] = [];
    server.use(
      http.get('/api/v1/radar', ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('status'));
        return radarPage([]);
      }),
    );
    renderRoute('/radar?status=REQUER_ANALISE');

    expect(await screen.findByText('Nenhuma empresa no estado "Requer análise".')).toBeInTheDocument();
    expect(requested).toEqual(['REQUER_ANALISE']);
  });

  it('um estado inválido no URL mostra a carteira toda', async () => {
    signedInAs(viewer);
    const requested: (string | null)[] = [];
    server.use(
      http.get('/api/v1/radar', ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('status'));
        return radarPage([]);
      }),
    );
    renderRoute('/radar?status=QUALQUER');

    expect(await screen.findByText('Ainda não há empresas na carteira.')).toBeInTheDocument();
    expect(requested).toEqual([null]);
  });

  it('pagina mantendo o filtro', async () => {
    signedInAs(viewer);
    const requests: string[] = [];
    server.use(
      http.get('/api/v1/radar', ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params.toString());
        return radarPage([semPerfil], 45, Number(params.get('page')));
      }),
    );
    renderRoute('/radar?status=DADOS_INCOMPLETOS');

    expect(await screen.findByText('Página 1 de 3 · 45 empresas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Seguinte' }));

    expect(await screen.findByText('Página 2 de 3 · 45 empresas')).toBeInTheDocument();
    expect(requests).toEqual([
      'page=1&pageSize=20&status=DADOS_INCOMPLETOS',
      'page=2&pageSize=20&status=DADOS_INCOMPLETOS',
    ]);
  });

  it('mostra o erro da API de forma clara', async () => {
    signedInAs(viewer);
    server.use(http.get('/api/v1/radar', () => errorResponse(500, 'Erro interno. Tente novamente mais tarde.')));
    renderRoute('/radar');

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno. Tente novamente mais tarde.');
  });

  it('gravar o perfil tributário atualiza o Radar (D26)', async () => {
    signedInAs(demoUser);
    let radarCalls = 0;
    server.use(
      http.get('/api/v1/radar', () => {
        radarCalls += 1;
        return radarPage([semPerfil]);
      }),
      http.get('/api/v1/companies/:id', () =>
        HttpResponse.json({ ...semPerfil.company, createdAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z' }),
      ),
      http.put('/api/v1/companies/:id/tax-profile', async ({ request }) =>
        HttpResponse.json({ ...((await request.json()) as object), city: null, state: null, cnae: null, updatedAt: '2026-10-09T12:00:00.000Z' }),
      ),
    );
    const { router } = renderRoute('/radar');
    await screen.findByRole('link', { name: 'Consultoria Demonstração Ltda' });
    expect(radarCalls).toBe(1);

    await userEvent.click(screen.getByRole('link', { name: 'Consultoria Demonstração Ltda' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Preencher perfil' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    await screen.findByRole('button', { name: 'Editar perfil' });

    await router.navigate('/radar');
    await screen.findByRole('link', { name: 'Consultoria Demonstração Ltda' });
    await waitFor(() => expect(radarCalls).toBe(2));
  });
});
