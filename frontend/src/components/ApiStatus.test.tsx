import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiStatus } from './ApiStatus';

describe('ApiStatus', () => {
  it('consulta /api/v1/health e indica API online', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ApiStatus />);

    expect(await screen.findByText('API online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.any(Object));
  });

  it('indica API indisponível quando o health check responde erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 'error' }, { status: 503 })),
    );

    render(<ApiStatus />);

    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
  });

  it('indica API indisponível quando não há resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<ApiStatus />);

    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
  });
});
