import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('exibe a marca e o estado da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Tribu.io' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('API online');
  });
});
