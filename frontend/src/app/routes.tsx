import { Navigate, type RouteObject } from 'react-router';
import { AuthLayout } from '../auth/AuthLayout';
import { LoginPage } from '../auth/LoginPage';
import { RegisterPage } from '../auth/RegisterPage';
import { RequireAuth } from '../auth/RequireAuth';
import { PlaceholderPage } from '../shared/components/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { ErrorPage } from './ErrorPage';
import { NotFoundPage } from './NotFoundPage';

/**
 * Mapa de rotas (docs/arquitetura-e-decisoes.md §6). As secções ainda não
 * implementadas mostram uma página "Em construção"; as rotas de detalhe
 * (/companies/:id, /analyses/:id, …) entram com cada funcionalidade.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/radar" replace /> },
              { path: '/radar', element: <PlaceholderPage title="Tax Radar" /> },
              { path: '/companies', element: <PlaceholderPage title="Empresas" /> },
              { path: '/imports', element: <PlaceholderPage title="Importações" /> },
              { path: '/audit', element: <PlaceholderPage title="Auditoria" /> },
              { path: '/settings/*', element: <PlaceholderPage title="Configurações" /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
