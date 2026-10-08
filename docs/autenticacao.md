# Autenticação, tenant e papéis

Como funciona a sessão, como o tenant é obtido e que regras seguir em cada módulo novo. Os endpoints estão documentados no Swagger, em `/api/docs`.

## Endpoints

| Método e rota | Acesso | Resposta |
|---|---|---|
| `POST /api/v1/auth/register` | público, rate limit | 201 + cookie; 400 dados inválidos; 409 email já registado |
| `POST /api/v1/auth/login` | público, rate limit | 200 + cookie; 400; 401 "Email ou password incorretos."; 429 |
| `GET /api/v1/auth/me` | sessão | 200 utilizador e escritório; 401 |
| `POST /api/v1/auth/logout` | público | 204 sempre; apaga o cookie |
| `GET /api/v1/users` | sessão (qualquer papel) | 200 equipa do escritório |
| `PATCH /api/v1/users/:id` | `ADMIN` | 200; 403; 404 (inexistente ou de outro escritório); 409 último ADMIN |

As respostas com utilizador têm só `id`, `name`, `email`, `role` e (no `auth`) `accountingFirm { id, name }`. `passwordHash`, `tokenVersion` e o token nunca saem da API.

## Sessão

```text
login/registo ─► JWT HS256 { sub, tv } ─► Set-Cookie tribu_session
pedido ─► AuthGuard (global) ─► verifica JWT ─► lê o utilizador na BD ─► compara tv
       ─► request.user ─► RolesGuard ─► controller (@CurrentUser / @CurrentTenant)
logout ─► tokenVersion + 1 ─► apaga o cookie
```

- **Cookie** `tribu_session`: `HttpOnly`, `SameSite=Strict`, `Path=/api`, 8 horas, `Secure` em produção (`COOKIE_SECURE`). O token nunca vai no corpo da resposta, e o frontend não o lê nem o guarda.
- **Claims mínimos:** `sub` (id do utilizador) e `tv` (`tokenVersion`). Papel e tenant vêm da base de dados a cada pedido, por isso uma mudança de papel tem efeito imediato.
- **Invalidação:** o logout incrementa `tokenVersion`, e todos os tokens anteriores desse utilizador deixam de valer, **em todos os dispositivos**. Não há refresh token (decisão D7).
- **Algoritmo fixo** `HS256` na verificação; tokens `none` ou com outro algoritmo são rejeitados. Trocar `JWT_SECRET` termina todas as sessões.
- **Frontend:** ao carregar, pergunta a sessão a `GET /auth/me`. Sem sessão, as rotas protegidas redirecionam para `/login`.

## Proteções do login e registo

| Ameaça | Mitigação |
|---|---|
| Brute force, credential stuffing | 10 tentativas por minuto por IP em login e registo (`@nestjs/throttler`) |
| Enumeração pelo login | Mesmo 401 e mesma mensagem para email inexistente e password errada |
| Enumeração pelo tempo de resposta | Email inexistente também corre argon2 contra um hash fictício |
| IP falsificado para contornar o limite | `trust proxy` com número exato de proxies (`TRUST_PROXY_HOPS`) |
| Campos internos no pedido (`role`, `accountingFirmId`, …) | `ValidationPipe` com `whitelist` e `forbidNonWhitelisted`: 400 |
| CSRF | `SameSite=Strict` + mesma origem (nginx serve o frontend e faz proxy de `/api`); a API só lê corpos em JSON, e um formulário HTML de outro site recebe 415 (D24) |

O registo devolve 409 para email já registado (decisão aprovada: mensagens claras, com rate limit a travar a enumeração).

**Password:** 8 a 128 caracteres, sem regras de composição (NIST 800-63B). Hash argon2id.

## Tenant: regras para todo o módulo novo

O tenant (`accountingFirmId`) vem **só** da sessão. Nunca do corpo, da query nem da URL.

1. No controller, obtenha o tenant com `@CurrentTenant() tenantId: TenantId`.
2. O service recebe `tenantId: TenantId` como primeiro parâmetro. O tipo `TenantId` só é produzido pelo decorator, por isso o TypeScript rejeita uma string vinda do pedido.
3. Toda consulta filtra por tenant: `where: { id, accountingFirmId: tenantId }`, também em `update` e `delete`. O service injeta `@Inject(PrismaService)`, que recusa a query se o filtro faltar (D16). O próprio escritório só é lido pelo `id`: `where: { id: tenantId }` (D25). Um model novo entra em `SCALAR_FIELDS` de [`tenant-scope.ts`](../backend/src/prisma/tenant-scope.ts); o TypeScript não compila sem ele.
4. Recurso de outro escritório responde **404**, com a mesma mensagem de um ID inexistente.
5. DTOs nunca têm `accountingFirmId`.
6. Na base de dados, toda tabela do tenant tem `accounting_firm_id NOT NULL` e as FKs entre tabelas do tenant são compostas `(x_id, accounting_firm_id)` (decisão D15).
7. **Definition of Done:** cada recurso novo tem teste e2e com dois escritórios (ver [`tenant-isolation.e2e-spec.ts`](../backend/test/tenant-isolation.e2e-spec.ts)) e cada rota com `:id` tem linha na [matriz BOLA](../backend/test/support/bola-matrix.ts).

O tipo `TenantId` garante que o service **recebe** o tenant, mas não que o **usa** na query. As regras completas e os mecanismos que detetam um filtro esquecido estão em [seguranca.md](seguranca.md).

Exemplo ([`users.service.ts`](../backend/src/users/users.service.ts)):

```ts
list(tenantId: TenantId) {
  return this.prisma.user.findMany({ where: { accountingFirmId: tenantId } });
}
```

## Papéis

- `AuthGuard` e `RolesGuard` são globais. Toda rota exige sessão, exceto as marcadas `@Public()`.
- `@Roles(Role.ADMIN, …)` restringe a rota; sem `@Roles()`, qualquer utilizador autenticado acede. Papel não permitido: 403.
- **Regras aprovadas até agora:** o primeiro utilizador do registo é `ADMIN`; só `ADMIN` altera utilizadores; o escritório nunca fica sem `ADMIN` (D13). Company e TaxProfile: todos os papéis leem, `ADMIN` e `ANALYST` criam e editam, sem exclusão no MVP (D20). As permissões das restantes funcionalidades são definidas com cada uma, antes da implementação.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JWT_SECRET` | sim | Segredo HS256, mínimo 32 caracteres (`openssl rand -base64 48`) |
| `COOKIE_SECURE` | não | `true` exige HTTPS no cookie. Padrão: `true` em produção. Local (`http://localhost`): `false` |
| `TRUST_PROXY_HOPS` | não (`1`) | Proxies à frente da API. O nginx do Docker conta 1; aumente só se o deploy acrescentar outro. Um valor acima do real permite falsificar o IP |

O modelo completo está no [`.env.example`](../.env.example).

## Deploy

A sessão pressupõe **uma única origem**: o mesmo domínio serve o frontend e faz proxy de `/api` (como o nginx do Docker). Frontend e API em domínios diferentes quebrariam o `SameSite=Strict` e exigiriam CORS com credenciais e proteção CSRF adicional.

Antes do deploy: `NODE_ENV=production` (padrão da imagem), `COOKIE_SECURE=true` (HTTPS), `JWT_SECRET` próprio e `TRUST_PROXY_HOPS` conforme a infraestrutura. Com `NODE_ENV=production`, a API e o seed recusam arrancar com valores do `.env.example` ou com `COOKIE_SECURE=false` (D19). O `helmet` já define os cabeçalhos de segurança da API; o `upgrade-insecure-requests` da CSP só é enviado com `COOKIE_SECURE=true`.
