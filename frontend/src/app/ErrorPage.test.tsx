import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ErrorPage } from './ErrorPage';

function Broken(): never {
  throw new Error('detalhe interno: stack trace');
}

describe('ErrorPage', () => {
  it('mostra uma mensagem genérica sem detalhes técnicos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([{ path: '/', element: <Broken />, errorElement: <ErrorPage /> }]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Ocorreu um erro inesperado' })).toBeInTheDocument();
    expect(screen.queryByText(/detalhe interno/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/radar');
    expect(document.title).toBe('Erro · Tribu.io');
  });
});
