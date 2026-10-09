import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/api';
import { renderRoute } from '../test/render';
import { demoUser, emptyTaxProfile, errorResponse, server } from '../test/server';
import type { Company, TaxProfile } from './api';

const company: Company = {
  id: '11111111-c000-4000-8000-000000000003',
  cnpj: '12ABC34501DE35',
  legalName: 'Estúdio Fictício de Design Ltda',
  tradeName: null,
  createdAt: '2026-10-03T12:00:00.000Z',
  updatedAt: '2026-10-03T12:00:00.000Z',
};

const partialProfile: TaxProfile = {
  taxRegime: 'SIMPLES_NACIONAL',
  cnae: '7410202',
  city: 'Santos',
  state: 'SP',
  revenue12m: '480000.00',
  payroll12m: null,
  referencePeriod: '2026-09',
  fatorRSubject: true,
  updatedAt: '2026-10-03T12:00:00.000Z',
};

function openCompany(user: AuthUser, profile: TaxProfile) {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(user)),
    http.get(`/api/v1/companies/${company.id}`, () => HttpResponse.json(company)),
    http.get(`/api/v1/companies/${company.id}/tax-profile`, () => HttpResponse.json(profile)),
  );
  renderRoute(`/companies/${company.id}`);
}

function section() {
  return screen.getByRole('region', { name: 'Perfil tributário' });
}

describe('perfil tributário', () => {
  it('mostra os dados conhecidos e destaca os ausentes como "Não informado"', async () => {
    openCompany(demoUser, partialProfile);

    expect(await screen.findByText('Simples Nacional')).toBeInTheDocument();
    expect(within(section()).getByText('7410-2/02')).toBeInTheDocument();
    expect(within(section()).getByText(/R\$\s480\.000,00/)).toBeInTheDocument();
    expect(within(section()).getByText('setembro de 2026')).toBeInTheDocument();
    expect(within(section()).getByText('Não informado')).toBeInTheDocument();
    expect(within(section()).getByText('Dados em falta: Folha de pagamento (12 meses).')).toBeInTheDocument();
  });

  it('empresa sem perfil convida a preencher; o VIEWER não vê o botão', async () => {
    openCompany({ ...demoUser, role: 'VIEWER' }, emptyTaxProfile);

    expect(await screen.findByText('O perfil tributário ainda não foi preenchido.')).toBeInTheDocument();
    expect(within(section()).getAllByText('Não informado')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: 'Preencher perfil' })).not.toBeInTheDocument();
  });

  it('preenche o perfil: valores em reais e CNAE com máscara; campo vazio vai como null', async () => {
    openCompany(demoUser, emptyTaxProfile);
    let body: unknown;
    server.use(
      http.put(`/api/v1/companies/${company.id}/tax-profile`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...partialProfile, payroll12m: null });
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Preencher perfil' }));
    await userEvent.selectOptions(screen.getByLabelText('Regime tributário'), 'SIMPLES_NACIONAL');
    const cnae = screen.getByLabelText('CNAE principal');
    await userEvent.type(cnae, '7410202');
    expect(cnae).toHaveValue('7410-2/02');
    await userEvent.type(screen.getByLabelText('Município'), 'Santos');
    await userEvent.selectOptions(screen.getByLabelText('UF'), 'SP');
    await userEvent.type(screen.getByLabelText('Receita bruta dos últimos 12 meses (R$)'), '480.000,00');
    fireEvent.change(screen.getByLabelText('Mês de referência'), { target: { value: '2026-09' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(await screen.findByText('Simples Nacional')).toBeInTheDocument();
    expect(body).toEqual({
      taxRegime: 'SIMPLES_NACIONAL',
      cnae: '7410-2/02',
      city: 'Santos',
      state: 'SP',
      revenue12m: '480000.00',
      payroll12m: null,
      referencePeriod: '2026-09',
      fatorRSubject: null,
    });
  });

  it('zero é um valor conhecido: aparece em reais, não como "Não informado"', async () => {
    openCompany(demoUser, { ...partialProfile, revenue12m: '0.00', payroll12m: '0.00' });

    expect(await screen.findByText('Simples Nacional')).toBeInTheDocument();
    expect(within(section()).getAllByText(/^R\$\s0,00$/)).toHaveLength(2);
    expect(within(section()).queryByText('Não informado')).not.toBeInTheDocument();
    expect(within(section()).queryByText(/Dados em falta/)).not.toBeInTheDocument();
  });

  it('apagar os dados e escolher "Não informado" envia null, nunca texto vazio', async () => {
    openCompany(demoUser, partialProfile);
    let body: unknown;
    server.use(
      http.put(`/api/v1/companies/${company.id}/tax-profile`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...emptyTaxProfile, updatedAt: '2026-10-06T12:00:00.000Z' });
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await userEvent.selectOptions(screen.getByLabelText('Regime tributário'), '');
    await userEvent.clear(screen.getByLabelText('CNAE principal'));
    await userEvent.clear(screen.getByLabelText('Município'));
    await userEvent.selectOptions(screen.getByLabelText('UF'), '');
    await userEvent.clear(screen.getByLabelText('Receita bruta dos últimos 12 meses (R$)'));
    fireEvent.change(screen.getByLabelText('Mês de referência'), { target: { value: '' } });
    await userEvent.selectOptions(screen.getByLabelText('Atividade sujeita ao Fator R'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(await screen.findByText(/Dados em falta/)).toBeInTheDocument();
    expect(body).toEqual({
      taxRegime: null,
      cnae: null,
      city: null,
      state: null,
      revenue12m: null,
      payroll12m: null,
      referencePeriod: null,
      fatorRSubject: null,
    });
  });

  it('cancelar fecha o formulário sem gravar', async () => {
    openCompany(demoUser, partialProfile);
    let saved = false;
    server.use(
      http.put(`/api/v1/companies/${company.id}/tax-profile`, () => {
        saved = true;
        return HttpResponse.json(partialProfile);
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await userEvent.clear(screen.getByLabelText('Município'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('button', { name: 'Guardar perfil' })).not.toBeInTheDocument();
    expect(within(section()).getByText('Santos')).toBeInTheDocument();
    expect(saved).toBe(false);
  });

  it('mostra o erro da API junto do campo', async () => {
    openCompany(demoUser, partialProfile);
    server.use(
      http.put(`/api/v1/companies/${company.id}/tax-profile`, () =>
        errorResponse(400, 'Dados inválidos.', [
          { field: 'payroll12m', messages: ['Informe um valor em reais, não negativo, com até 2 casas decimais.'] },
        ]),
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    const payroll = screen.getByLabelText('Folha de pagamento dos últimos 12 meses (R$)');
    await userEvent.type(payroll, '-10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(await screen.findByText(/não negativo/)).toBeInTheDocument();
    expect(payroll).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Receita bruta dos últimos 12 meses (R$)')).toHaveValue('480.000,00');
  });

  describe('atividade sujeita ao Fator R (D33)', () => {
    it.each([
      [true, 'Sim'],
      [false, 'Não'],
    ] as const)('mostra %s como "%s"', async (fatorRSubject, text) => {
      openCompany(demoUser, { ...partialProfile, fatorRSubject });

      const section = await screen.findByRole('region', { name: 'Perfil tributário' });
      const row = (await within(section).findByText('Atividade sujeita ao Fator R')).parentElement!;
      expect(within(row).getByText(text)).toBeInTheDocument();
    });

    it('a dúvida fica como dado em falta, com a ajuda da lei', async () => {
      openCompany(demoUser, { ...partialProfile, fatorRSubject: null });

      expect(
        await screen.findByText(/Dados em falta: .*Atividade sujeita ao Fator R\./),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));
      const field = screen.getByLabelText('Atividade sujeita ao Fator R');
      expect(field).toHaveValue('');
      expect(field).toHaveAccessibleDescription(/§§ 5º-I e 5º-M/);
    });

    it.each([true, false])(
      'editar outro campo mantém a elegibilidade já gravada (%s)',
      async (fatorRSubject) => {
        openCompany(demoUser, { ...partialProfile, fatorRSubject });
        let body: unknown;
        server.use(
          http.put(`/api/v1/companies/${company.id}/tax-profile`, async ({ request }) => {
            body = await request.json();
            return HttpResponse.json({ ...partialProfile, fatorRSubject, updatedAt: '2026-10-06T12:00:00.000Z' });
          }),
        );

        await userEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
        expect(screen.getByLabelText('Atividade sujeita ao Fator R')).toHaveValue(String(fatorRSubject));
        await userEvent.type(screen.getByLabelText('Folha de pagamento dos últimos 12 meses (R$)'), '100.000,00');
        await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
        await screen.findByRole('button', { name: 'Editar perfil' });

        expect(body).toMatchObject({ payroll12m: '100000.00', fatorRSubject });
      },
    );

    it('escolher "Sim" ou "Não" envia true ou false', async () => {
      openCompany(demoUser, partialProfile);
      const bodies: unknown[] = [];
      server.use(
        http.put(`/api/v1/companies/${company.id}/tax-profile`, async ({ request }) => {
          const body = (await request.json()) as object;
          bodies.push(body);
          return HttpResponse.json({ ...partialProfile, ...body, updatedAt: '2026-10-06T12:00:00.000Z' });
        }),
      );

      for (const option of ['false', 'true']) {
        await userEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
        await userEvent.selectOptions(screen.getByLabelText('Atividade sujeita ao Fator R'), option);
        await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
      }
      await screen.findByRole('button', { name: 'Editar perfil' });

      expect(bodies.map((b) => (b as { fatorRSubject: unknown }).fatorRSubject)).toEqual([false, true]);
    });
  });
});
