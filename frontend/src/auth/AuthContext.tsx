import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized } from '../shared/api/http';
import * as authApi from './api';
import type { AuthUser, LoginInput, RegisterInput } from './api';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  /** `sessionExpired`: havia sessão e ela deixou de ser válida durante o uso. */
  | { status: 'anonymous'; user: null; sessionExpired: boolean };

export type AuthContextValue = AuthState & {
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, sessionExpired: false };
const EXPIRED: AuthState = { status: 'anonymous', user: null, sessionExpired: true };

/**
 * Estado da sessão. O cookie é httpOnly: ao carregar a aplicação, a sessão é
 * restaurada perguntando ao backend (GET /auth/me), não lendo armazenamento local.
 *
 * Sessão expirada durante o uso (8h, logout noutro dispositivo): detetada por
 * qualquer 401 da API e ao voltar ao separador; o RequireAuth leva ao login.
 * Deve ficar dentro de um QueryClientProvider: o cache é limpo sem sessão.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const queryClient = useQueryClient();

  // Sem sessão, nenhum dado do escritório fica em cache (regra S24).
  useEffect(() => {
    if (state.status === 'anonymous') queryClient.clear();
  }, [state.status, queryClient]);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .fetchCurrentUser(controller.signal)
      .then((user) => setState(user ? { status: 'authenticated', user } : ANONYMOUS))
      .catch(() => {
        if (!controller.signal.aborted) setState(ANONYMOUS);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => onUnauthorized(() => setState(EXPIRED)), []);

  // Ao voltar ao separador, confirma que a sessão continua válida.
  useEffect(() => {
    if (state.status !== 'authenticated') return;

    function revalidate() {
      if (document.visibilityState !== 'visible') return;
      authApi
        .fetchCurrentUser()
        .then((user) => {
          if (!user) setState(EXPIRED);
        })
        .catch(() => {
          // Falha de rede: mantém a sessão; o próximo pedido volta a verificar.
        });
    }
    document.addEventListener('visibilitychange', revalidate);
    return () => document.removeEventListener('visibilitychange', revalidate);
  }, [state.status]);

  const login = useCallback(async (input: LoginInput) => {
    const user = await authApi.login(input);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const user = await authApi.register(input);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    // Sem rede, a sessão termina na mesma no browser.
    await authApi.logout().catch(() => undefined);
    setState(ANONYMOUS);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return context;
}
