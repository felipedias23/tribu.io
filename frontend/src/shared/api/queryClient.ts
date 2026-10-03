import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

/** Erros 4xx não melhoram com nova tentativa; falhas de rede e 5xx tentam mais uma vez. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * Cache dos pedidos à API (TanStack Query). É limpo no logout e quando a
 * sessão expira (regra S24), pelo AuthProvider.
 */
export function createQueryClient({ retry = true }: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retry ? shouldRetry : false,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
