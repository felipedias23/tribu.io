import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { createTestApp } from './support/app';
import { BOLA_CASES, routeKey } from './support/bola-matrix';

/**
 * Rotas sem sessão (regra S12). Acrescentar uma rota @Public() obriga a
 * atualizar esta lista, o que fica visível na revisão do PR.
 */
const PUBLIC_ROUTES = [
  'GET /health',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/register',
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
  hasRoles: boolean;
}

function joinPath(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/');
  return `/${path}`;
}

/** Lê as rotas a partir dos metadados dos controllers registados no Nest. */
function collectRoutes(app: NestExpressApplication): Route[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);

  return discovery.getControllers().flatMap(({ metatype, instance }) => {
    if (!metatype || !instance) return [];
    const controllerPath = String(
      Reflect.getMetadata(PATH_METADATA, metatype) ?? '',
    );
    const prototype = Object.getPrototypeOf(instance) as object;

    return scanner.getAllMethodNames(prototype).flatMap((name) => {
      const handler = (prototype as Record<string, () => unknown>)[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (method === undefined) return [];
      const targets = [handler, metatype];
      return [
        {
          method: RequestMethod[method],
          path: joinPath(
            controllerPath,
            String(Reflect.getMetadata(PATH_METADATA, handler) ?? ''),
          ),
          isPublic:
            reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ??
            false,
          hasRoles:
            reflector.getAllAndOverride<unknown[]>(ROLES_KEY, targets) !==
            undefined,
        },
      ];
    });
  });
}

/** Inventário de rotas (decisão D17, regras S12 e S13). */
describe('Inventário de rotas (e2e)', () => {
  let app: NestExpressApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await createTestApp({ imports: [DiscoveryModule] });
    routes = collectRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('encontra as rotas da API', () => {
    expect(routes.map(routeKey)).toContain('PATCH /users/:id');
  });

  it('só as rotas da allowlist são @Public()', () => {
    const publicRoutes = routes
      .filter((route) => route.isPublic)
      .map(routeKey)
      .sort();

    expect(publicRoutes).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('toda rota com parâmetro tem linha na matriz BOLA', () => {
    const covered = new Set(BOLA_CASES.map(routeKey));
    const missing = routes
      .filter((route) => route.path.includes(':'))
      .map(routeKey)
      .filter((key) => !covered.has(key));

    expect(missing).toEqual([]);
  });

  it('toda linha da matriz BOLA corresponde a uma rota existente', () => {
    const existing = new Set(routes.map(routeKey));
    const stale = BOLA_CASES.map(routeKey).filter((key) => !existing.has(key));

    expect(stale).toEqual([]);
  });

  it('toda rota de escrita autenticada declara @Roles() (S13)', () => {
    const missing = routes
      .filter(
        (route) =>
          WRITE_METHODS.has(route.method) && !route.isPublic && !route.hasRoles,
      )
      .map(routeKey);

    expect(missing).toEqual([]);
  });
});
