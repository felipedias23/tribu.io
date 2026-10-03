import type { RouteObject } from 'react-router';
import { AuthLayout } from '../auth/AuthLayout';
import { LoginPage } from '../auth/LoginPage';
import { RegisterPage } from '../auth/RegisterPage';
import { RequireAuth } from '../auth/RequireAuth';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

/** Rotas (docs/relatorio-fase1.md §6). As páginas de negócio entram nas próximas etapas. */
export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ index: true, element: <HomePage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
];
