import { Navigate, type RouteObject } from 'react-router';
import { AuthLayout } from '../auth/AuthLayout';
import { LoginPage } from '../auth/LoginPage';
import { RegisterPage } from '../auth/RegisterPage';
import { RequireAuth } from '../auth/RequireAuth';
import { CompaniesPage } from '../companies/CompaniesPage';
import { CompanyDetailPage } from '../companies/CompanyDetailPage';
import { CompanyNewPage } from '../companies/CompanyNewPage';
import { AnalysisPage } from '../analyses/AnalysisPage';
import { RadarPage } from '../radar/RadarPage';
import { PlaceholderPage } from '../shared/components/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { ErrorPage } from './ErrorPage';
import { NotFoundPage } from './NotFoundPage';

/**
 * Mapa de rotas (docs/arquitetura-e-decisoes.md §6). As secções ainda não
 * implementadas mostram uma página "Em construção"; as rotas de detalhe
 * (/analyses/:id, …) entram com cada funcionalidade.
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
              { path: '/radar', element: <RadarPage /> },
              { path: '/companies', element: <CompaniesPage /> },
              { path: '/companies/new', element: <CompanyNewPage /> },
              { path: '/companies/:id', element: <CompanyDetailPage /> },
              { path: '/analyses/:id', element: <AnalysisPage /> },
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
