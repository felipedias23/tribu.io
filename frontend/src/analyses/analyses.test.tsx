import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/api';
import { renderRoute } from '../test/render';
import { demoUser, errorResponse, server } from '../test/server';
import type { Analysis } from './api';

const analyst: AuthUser = { ...demoUser, role: 'ANALYST', name: 'Analista Alfa' };
const viewer: AuthUser = { ...demoUser, role: 'VIEWER', name: 'Consulta Alfa' };
const COMPANY_ID = '11111111-c000-4000-8000-000000000011';

const company = {
  id: COMPANY_ID,
  cnpj: '12ABC34501DE35',
  legalName: 'Agência Fictícia de Viagens Ltda',
  tradeName: null,
  createdAt: '2026-10-03T12:00:00.000Z',
  updatedAt: '2026-10-03T12:00:00.000Z',
};

const completed: Analysis = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyId: COMPANY_ID,
  status: 'COMPLETED',
  radarStatus: 'OPORTUNIDADE_PARA_AVALIAR',
  executedAt: '2026-10-09T20:16:41.513Z',
  executedBy: { id: analyst.id, name: 'Analista Alfa' },
  ruleVersion: {
    id: 'f0000000-0000-4000-8000-000000000101',
    ruleCode: 'SIMPLES_FATOR_R',
    ruleName: 'Simples Nacional: Fator R (Anexo III ou V)',
    version: 1,
    evaluatorKey: 'SIMPLES_FATOR_R@1',
    validFrom: '2018-01-01',
    validUntil: null,
    source: 'LC 123/2006, art. 18, §§ 1º-A, 5º-J, 5º-K e 5º-M',
  },
  result: { fatorR: '0.27', annex: 'V', bracket: 4, nominalRate: '0.205', deduction: '17100.00', effectiveRate: '0.1936' },
  engineVersion: '1.0.0',
  parametersChecksum: 'ad55d2d82ccc79544a1acc6380a4713436f5a59b9b2860777595d101716423a6',
  input: {
    taxRegime: 'SIMPLES_NACIONAL',
    cnae: '7911200',
    revenue12m: '1500000.00',
    payroll12m: '405000.00',
    referencePeriod: '2026-09',
  },
  trace: {
    outcome: { status: 'COMPLETED' },
    steps: [
      { code: 'FATOR_R', description: 'Fator R = folha ÷ RBT12 = R$ 405.000,00 ÷ R$ 1.500.000,00 = 27,00%.', values: {} },
      { code: 'ANEXO', description: '27,00% é inferior a 28,00%: Anexo V.', values: {} },
    ],
    missing: [],
    assumptions: [{ code: 'ATIVIDADE_SUJEITA_FATOR_R', description: 'A atividade é tratada como sujeita ao Fator R.' }],
    reasons: [{ code: 'NEAR_THRESHOLD_BELOW', message: 'Fator R de 27,00%, a 1,00 p.p. do limiar de 28,00%.' }],
  },
};

const incomplete: Analysis = {
  ...completed,
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  status: 'INCOMPLETE',
  radarStatus: 'DADOS_INCOMPLETOS',
  ruleVersion: null,
  parametersChecksum: null,
  result: null,
  input: { ...completed.input, payroll12m: null, referencePeriod: null },
  trace: {
    outcome: { status: 'INCOMPLETE' },
    steps: [],
    missing: ['payroll12m', 'referencePeriod'],
    assumptions: [],
    reasons: [{ code: 'MISSING_DATA', message: 'Faltam dados para o cálculo.' }],
  },
};

function signedInAs(user: AuthUser) {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(user)),
    http.get('/api/v1/companies/:id', () => HttpResponse.json(company)),
  );
}

describe('análises', () => {
  it('ANALYST executa a análise na ficha e vê a explicação', async () => {
    signedInAs(analyst);
    let posted = 0;
    server.use(
      http.post('/api/v1/companies/:id/analyses', () => {
        posted += 1;
        return HttpResponse.json(completed, { status: 201 });
      }),
    );
    const { router } = renderRoute(`/companies/${COMPANY_ID}`);

    expect(await screen.findByText('Esta empresa ainda não foi analisada.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Executar análise' }));

    expect(
      await screen.findByRole('heading', { name: 'Análise do Fator R · Agência Fictícia de Viagens Ltda' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/analyses/${completed.id}`);
    expect(posted).toBe(1);
  });

  it('a explicação mostra resultado, sinal, cálculo, dados, premissas e regra (US11)', async () => {
    signedInAs(viewer);
    server.use(http.get('/api/v1/analyses/:id', () => HttpResponse.json(completed)));
    renderRoute(`/analyses/${completed.id}`);

    await screen.findByRole('heading', { name: /Análise do Fator R/ });
    expect(screen.getByText('Concluída · executada em 09/10/2026, 17:16 por Analista Alfa', { exact: false })).toBeInTheDocument();

    const result = screen.getByText('Fator R').closest('dl')!;
    expect(within(result).getByText('27,00%')).toBeInTheDocument();
    expect(within(result).getByText('Anexo V')).toBeInTheDocument();
    expect(within(result).getByText('19,36%')).toBeInTheDocument();
    expect(within(result).getByText('20,50%')).toBeInTheDocument();
    expect(within(result).getByText('R$ 17.100,00')).toBeInTheDocument();

    const signal = screen.getByRole('region', { name: 'Sinal do Tax Radar' });
    expect(within(signal).getByText('Oportunidade para avaliar')).toBeInTheDocument();
    expect(within(signal).getByText(completed.trace.reasons[0].message)).toBeInTheDocument();

    const steps = within(screen.getByRole('region', { name: 'Como foi calculado' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(completed.trace.steps.map((step) => step.description));

    const input = screen.getByRole('region', { name: 'Dados usados' });
    expect(within(input).getByText('R$ 1.500.000,00')).toBeInTheDocument();
    expect(within(input).getByText('7911-2/00')).toBeInTheDocument();
    expect(within(input).getByText('setembro de 2026')).toBeInTheDocument();

    expect(
      within(screen.getByRole('region', { name: 'Premissas' })).getByText(completed.trace.assumptions[0].description),
    ).toBeInTheDocument();

    const rule = screen.getByRole('region', { name: 'Regra aplicada' });
    expect(within(rule).getByText('Simples Nacional: Fator R (Anexo III ou V) (SIMPLES_FATOR_R)')).toBeInTheDocument();
    expect(within(rule).getByText('1 · SIMPLES_FATOR_R@1')).toBeInTheDocument();
    expect(within(rule).getByText('desde 01/01/2018, sem data de fim')).toBeInTheDocument();
    expect(within(rule).getByText(completed.ruleVersion!.source)).toBeInTheDocument();
    expect(within(rule).getByText(completed.parametersChecksum!)).toBeInTheDocument();

    // O nome da empresa chega num segundo pedido.
    expect(await screen.findByRole('link', { name: '← Agência Fictícia de Viagens Ltda' })).toHaveAttribute(
      'href',
      `/companies/${COMPANY_ID}`,
    );
  });

  it('uma análise incompleta diz o que faltou, sem cálculo nem regra', async () => {
    signedInAs(viewer);
    server.use(http.get('/api/v1/analyses/:id', () => HttpResponse.json(incomplete)));
    renderRoute(`/analyses/${incomplete.id}`);

    expect(
      await screen.findByText('Dados em falta: Folha de pagamento (12 meses), Mês de referência.'),
    ).toBeInTheDocument();
    expect(screen.getByText('A análise não chegou a calcular o Fator R.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Como foi calculado' })).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma versão da regra foi aplicada.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Dados usados' })).getAllByText('Não informado')).toHaveLength(2);
  });

  it('mostra o motivo do desfecho quando o cálculo não foi possível', async () => {
    signedInAs(viewer);
    const message = 'Sem receita nos últimos 12 meses (RBT12 = 0), o Fator R não tem base de cálculo.';
    server.use(
      http.get('/api/v1/analyses/:id', () =>
        HttpResponse.json({
          ...incomplete,
          trace: { ...incomplete.trace, missing: [], outcome: { status: 'NOT_COMPUTABLE', code: 'REVENUE_ZERO', message } },
        }),
      ),
    );
    renderRoute(`/analyses/${incomplete.id}`);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/Dados em falta/)).not.toBeInTheDocument();
  });

  it('análise inexistente ou de outro escritório', async () => {
    signedInAs(viewer);
    server.use(http.get('/api/v1/analyses/:id', () => errorResponse(404, 'Análise não encontrada.')));
    renderRoute('/analyses/aaaaaaaa-0000-4000-8000-000000000099');

    expect(await screen.findByRole('heading', { name: 'Análise não encontrada' })).toBeInTheDocument();
  });

  it('VIEWER vê o histórico, mas não o botão de executar (D27)', async () => {
    signedInAs(viewer);
    server.use(
      http.get('/api/v1/companies/:id/analyses', () =>
        HttpResponse.json({ items: [completed, incomplete], total: 2, page: 1, pageSize: 10 }),
      ),
    );
    renderRoute(`/companies/${COMPANY_ID}`);

    const history = await screen.findByRole('list', { name: 'Histórico de análises' });
    const [first, second] = within(history).getAllByRole('listitem');
    expect(within(first).getByRole('link', { name: '09/10/2026, 17:16' })).toHaveAttribute(
      'href',
      `/analyses/${completed.id}`,
    );
    expect(within(first).getByText('Anexo V · alíquota efetiva 19,36%')).toBeInTheDocument();
    expect(within(first).getByText('por Analista Alfa · versão 1 da regra')).toBeInTheDocument();
    expect(within(second).getByText('Incompleta')).toBeInTheDocument();
    expect(within(second).getByText('Dados incompletos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Executar análise' })).not.toBeInTheDocument();
  });

  it('fora do Simples, mostra a mensagem da API e fica na ficha (D31)', async () => {
    signedInAs(analyst);
    const message = 'O Fator R só se aplica ao Simples Nacional; a empresa está noutro regime.';
    server.use(http.post('/api/v1/companies/:id/analyses', () => errorResponse(422, message)));
    const { router } = renderRoute(`/companies/${COMPANY_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Executar análise' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe(`/companies/${COMPANY_ID}`);
    expect(screen.getByRole('button', { name: 'Executar análise' })).toBeEnabled();
  });

  it('executar uma análise atualiza o Radar, que mostra a última análise', async () => {
    signedInAs(analyst);
    let radarCalls = 0;
    server.use(
      http.get('/api/v1/radar', () => {
        radarCalls += 1;
        return HttpResponse.json({
          items: [
            {
              company,
              status: 'OPORTUNIDADE_PARA_AVALIAR',
              priorityScore: 3989,
              reasons: [],
              ruleVersion: null,
              lastAnalysis: null,
              result: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }),
      http.post('/api/v1/companies/:id/analyses', () => HttpResponse.json(completed, { status: 201 })),
      http.get('/api/v1/analyses/:id', () => HttpResponse.json(completed)),
    );
    const { router } = renderRoute('/radar');

    await userEvent.click(await screen.findByRole('link', { name: company.legalName }));
    await userEvent.click(await screen.findByRole('button', { name: 'Executar análise' }));
    await screen.findByRole('region', { name: 'Regra aplicada' });
    expect(radarCalls).toBe(1);

    await router.navigate('/radar');
    await screen.findByRole('link', { name: company.legalName });
    await vi.waitFor(() => expect(radarCalls).toBe(2));
  });

  it('pagina o histórico, das mais recentes para as mais antigas', async () => {
    signedInAs(viewer);
    const pages: (string | null)[] = [];
    server.use(
      http.get('/api/v1/companies/:id/analyses', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        pages.push(page);
        return HttpResponse.json({ items: [completed], total: 12, page: Number(page), pageSize: 10 });
      }),
    );
    renderRoute(`/companies/${COMPANY_ID}`);

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mais recentes' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Mais antigas' }));

    expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument();
    expect(pages).toEqual(['1', '2']);
  });
});
