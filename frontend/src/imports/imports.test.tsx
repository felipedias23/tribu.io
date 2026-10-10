import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/api';
import { renderRoute } from '../test/render';
import { demoUser, errorResponse, server } from '../test/server';
import type { ImportDetail } from './api';

const analyst: AuthUser = { ...demoUser, role: 'ANALYST', name: 'Analista Alfa' };
const viewer: AuthUser = { ...demoUser, role: 'VIEWER', name: 'Consulta Alfa' };
const ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const preview: ImportDetail = {
  id: ID,
  status: 'PREVIEW',
  fileName: 'carteira.xlsx',
  fileFormat: 'XLSX',
  origin: 'Sistema X',
  summary: { total: 5, new: 1, updated: 1, unchanged: 1, conflict: 1, error: 1, ignoredColumns: ['Observações'] },
  createdBy: { id: analyst.id, name: 'Analista Alfa' },
  createdAt: '2026-10-10T12:00:00.000Z',
  expiresAt: '2026-10-11T12:00:00.000Z',
  closedAt: null,
  closedBy: null,
  rows: [
    { line: 2, outcome: 'NEW', cnpj: '12ABC34501DE35', legalName: 'Nova Ltda', externalId: 'E-1', companyId: null, changes: [], errors: [], reason: null },
    {
      line: 3,
      outcome: 'UPDATED',
      cnpj: '11222333000181',
      legalName: 'Mantida Ltda',
      externalId: null,
      companyId: 'c-1',
      changes: [
        { field: 'payroll12m', before: '300000.00', after: '350000.00' },
        { field: 'fatorRSubject', before: null, after: true },
      ],
      errors: [],
      reason: null,
    },
    { line: 4, outcome: 'UNCHANGED', cnpj: 'TRIBUX00000170', legalName: 'Igual Ltda', externalId: null, companyId: 'c-2', changes: [], errors: [], reason: null },
    { line: 5, outcome: 'CONFLICT', cnpj: '11222333000181', legalName: 'Repetida', externalId: null, companyId: null, changes: [], errors: [], reason: 'CNPJ repetido no ficheiro (linhas 3, 5).' },
    {
      line: 6,
      outcome: 'ERROR',
      cnpj: null,
      legalName: 'Com erro',
      externalId: null,
      companyId: null,
      changes: [],
      errors: [{ column: 'receita_12m', message: 'Célula com fórmula: exporte os valores, não as fórmulas.' }],
      reason: null,
    },
  ],
};

function signedInAs(user: AuthUser) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(user)));
}

function file(content: string, name = 'carteira.csv') {
  return new File([content], name, { type: 'text/csv' });
}

describe('importação', () => {
  describe('histórico (/imports)', () => {
    it('lista as importações; ANALYST vê "Nova importação"', async () => {
      signedInAs(analyst);
      server.use(
        http.get('/api/v1/imports', () =>
          HttpResponse.json({ items: [{ ...preview, rows: undefined }], total: 1, page: 1, pageSize: 20 }),
        ),
      );
      renderRoute('/imports');

      const history = await screen.findByRole('list', { name: 'Histórico de importações' });
      const [item] = within(history).getAllByRole('listitem');
      expect(within(item).getByRole('link', { name: 'carteira.xlsx' })).toHaveAttribute('href', `/imports/${ID}`);
      expect(within(item).getByText('Prévia por confirmar')).toBeInTheDocument();
      expect(within(item).getByText('1 novas · 1 atualizadas · 1 conflitos · 1 com erro')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Nova importação' })).toHaveAttribute('href', '/imports/new');
    });

    it('VIEWER não vê "Nova importação" e é levado de volta se abrir o formulário (D34)', async () => {
      signedInAs(viewer);
      const { router } = renderRoute('/imports/new');

      expect(await screen.findByRole('heading', { name: 'Importações' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/imports');
      expect(screen.queryByRole('link', { name: 'Nova importação' })).not.toBeInTheDocument();
    });
  });

  describe('envio (/imports/new)', () => {
    it('envia o ficheiro em base64 com a origem e abre a prévia', async () => {
      signedInAs(analyst);
      let body: { fileName: string; contentBase64: string; origin: string } | undefined;
      server.use(
        http.post('/api/v1/imports', async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(preview, { status: 201 });
        }),
        http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)),
      );
      const { router } = renderRoute('/imports/new');

      expect(await screen.findByRole('link', { name: 'ficheiro de exemplo' })).toHaveAttribute(
        'href',
        '/modelo-importacao.csv',
      );
      const origin = screen.getByLabelText('Origem dos dados');
      await userEvent.clear(origin);
      await userEvent.type(origin, 'Sistema X');
      await userEvent.upload(screen.getByLabelText('Ficheiro CSV ou XLSX'), file('cnpj;razao_social\n1;Ação'));
      await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));

      expect(await screen.findByRole('heading', { name: 'carteira.xlsx' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/imports/${ID}`);
      expect(body?.fileName).toBe('carteira.csv');
      expect(body?.origin).toBe('Sistema X');
      expect(new TextDecoder().decode(Uint8Array.from(atob(body!.contentBase64), (c) => c.charCodeAt(0)))).toBe(
        'cnpj;razao_social\n1;Ação',
      );
    });

    it.each([
      ['sem ficheiro', null, 'Escolha um ficheiro CSV ou XLSX.'],
      ['outra extensão', file('x', 'carteira.ods'), 'Envie um ficheiro .csv ou .xlsx.'],
      ['acima de 2 MB', file('x'.repeat(2 * 1024 * 1024 + 1)), 'O ficheiro excede o tamanho máximo de 2 MB.'],
    ])('verifica no browser antes de enviar: %s', async (_case, chosen, message) => {
      signedInAs(analyst);
      const sent = vi.fn();
      server.use(http.post('/api/v1/imports', () => (sent(), HttpResponse.json(preview))));
      renderRoute('/imports/new');

      const input = await screen.findByLabelText('Ficheiro CSV ou XLSX');
      if (chosen) await userEvent.upload(input, chosen, { applyAccept: false });
      await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(sent).not.toHaveBeenCalled();
    });

    it('mostra a mensagem da API quando o ficheiro é recusado', async () => {
      signedInAs(analyst);
      const message = 'Faltam as colunas obrigatórias: razao_social. Use o ficheiro de exemplo.';
      server.use(http.post('/api/v1/imports', () => errorResponse(422, message)));
      renderRoute('/imports/new');

      await userEvent.upload(await screen.findByLabelText('Ficheiro CSV ou XLSX'), file('cnpj\n1'));
      await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeEnabled();
    });
  });

  describe('prévia (/imports/:id)', () => {
    it('mostra primeiro conflitos e erros, depois novas, atualizadas e sem alterações', async () => {
      signedInAs(analyst);
      server.use(http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)));
      renderRoute(`/imports/${ID}`);

      await screen.findByRole('heading', { name: 'carteira.xlsx' });
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
        'Conflitos (1)',
        'Com erro (1)',
        'Novas (1)',
        'Atualizadas (1)',
        'Sem alterações (1)',
      ]);
      expect(screen.getByText('CNPJ repetido no ficheiro (linhas 3, 5).')).toBeInTheDocument();
      expect(screen.getByText('Linha 6: Com erro')).toBeInTheDocument();
      expect(screen.getByText(/receita_12m/).parentElement).toHaveTextContent(
        'receita_12m: Célula com fórmula: exporte os valores, não as fórmulas.',
      );
      expect(screen.getByText('Linha 2: Nova Ltda · 12.ABC.345/01DE-35')).toBeInTheDocument();
      expect(screen.getByText('Colunas ignoradas (fora do modelo): Observações.')).toBeInTheDocument();
    });

    it('mostra o antes e o depois das atualizadas, no formato da ficha', async () => {
      signedInAs(analyst);
      server.use(http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)));
      renderRoute(`/imports/${ID}`);

      const updated = await screen.findByRole('region', { name: 'Atualizadas (1)' });
      // O Intl separa "R$" do valor com um espaço não separável (U+00A0).
      expect(
        within(updated)
          .getAllByRole('listitem')
          .slice(1)
          .map((li) => li.textContent?.replace(/\u00a0/g, ' ')),
      ).toEqual([
        'Folha de pagamento (12 meses): R$ 300.000,00 → R$ 350.000,00',
        'Atividade sujeita ao Fator R: vazio → Sim',
      ]);
    });

    it('confirmar grava, mostra o resumo e atualiza o Radar (D38)', async () => {
      signedInAs(analyst);
      let radarCalls = 0;
      server.use(
        http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)),
        http.post(`/api/v1/imports/${ID}/confirm`, () =>
          HttpResponse.json({
            ...preview,
            status: 'CONFIRMED',
            rows: null,
            closedAt: '2026-10-10T12:05:00.000Z',
            closedBy: { id: analyst.id, name: 'Analista Alfa' },
          }),
        ),
        http.get('/api/v1/radar', () => {
          radarCalls += 1;
          return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 });
        }),
      );
      const { router } = renderRoute('/radar');
      await waitFor(() => expect(radarCalls).toBe(1));
      await router.navigate(`/imports/${ID}`);

      await userEvent.click(await screen.findByRole('button', { name: 'Confirmar (2 empresas)' }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Importação confirmada por Analista Alfa: 1 empresas criadas e 1 atualizadas.',
      );
      expect(screen.queryByRole('region', { name: 'Novas (1)' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('link', { name: 'Ver o Tax Radar' }));
      await waitFor(() => expect(radarCalls).toBe(2));
    });

    it('se a confirmação for recusada, mostra o motivo e o estado atual', async () => {
      signedInAs(analyst);
      let calls = 0;
      server.use(
        http.get(`/api/v1/imports/${ID}`, () => {
          calls += 1;
          return HttpResponse.json(calls === 1 ? preview : { ...preview, status: 'EXPIRED', rows: null });
        }),
        http.post(`/api/v1/imports/${ID}/confirm`, () =>
          errorResponse(409, 'A prévia expirou (24 horas): envie o ficheiro de novo para uma prévia atualizada.'),
        ),
      );
      renderRoute(`/imports/${ID}`);

      await userEvent.click(await screen.findByRole('button', { name: 'Confirmar (2 empresas)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('A prévia expirou');
      expect(await screen.findByRole('link', { name: 'Envie o ficheiro de novo' })).toHaveAttribute(
        'href',
        '/imports/new',
      );
    });

    it('cancelar fecha a prévia sem gravar', async () => {
      signedInAs(analyst);
      server.use(
        http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)),
        http.post(`/api/v1/imports/${ID}/cancel`, () =>
          HttpResponse.json({ ...preview, status: 'CANCELLED', rows: null, closedAt: '2026-10-10T12:05:00.000Z' }),
        ),
      );
      renderRoute(`/imports/${ID}`);

      await userEvent.click(await screen.findByRole('button', { name: 'Cancelar importação' }));

      expect(await screen.findByText('Importação cancelada: nada foi gravado.')).toBeInTheDocument();
    });

    it('sem linhas novas nem atualizadas, não há nada para confirmar', async () => {
      signedInAs(analyst);
      server.use(
        http.get(`/api/v1/imports/${ID}`, () =>
          HttpResponse.json({ ...preview, summary: { ...preview.summary, new: 0, updated: 0 } }),
        ),
      );
      renderRoute(`/imports/${ID}`);

      expect(await screen.findByRole('button', { name: 'Confirmar (0 empresas)' })).toBeDisabled();
    });

    it('VIEWER vê a prévia, mas não os botões', async () => {
      signedInAs(viewer);
      server.use(http.get(`/api/v1/imports/${ID}`, () => HttpResponse.json(preview)));
      renderRoute(`/imports/${ID}`);

      await screen.findByRole('region', { name: 'Novas (1)' });
      expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar importação' })).not.toBeInTheDocument();
    });

    it('importação inexistente ou de outro escritório', async () => {
      signedInAs(viewer);
      server.use(http.get(`/api/v1/imports/${ID}`, () => errorResponse(404, 'Importação não encontrada.')));
      renderRoute(`/imports/${ID}`);

      expect(await screen.findByRole('heading', { name: 'Importação não encontrada' })).toBeInTheDocument();
    });
  });
});
