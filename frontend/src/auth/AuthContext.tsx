import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from './api';
import type { AuthUser, LoginInput, RegisterInput } from './api';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous'; user: null };

export type AuthContextValue = AuthState & {
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS: AuthState = { status: 'anonymous', user: null };

/**
 * Estado da sessão. O cookie é httpOnly: ao carregar a aplicação, a sessão é
 * restaurada perguntando ao backend (GET /auth/me), não lendo armazenamento local.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

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

  const login = useCallback(async (input: LoginInput) => {
    const user = await authApi.login(input);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const user = await authApi.register(input);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState(ANONYMOUS);
    }
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
