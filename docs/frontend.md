# Frontend: layout base, rotas e sessão

React 19 + TypeScript + Vite, com React Router, TanStack Query e CSS Modules (relatório §6). Este documento descreve o layout base, os módulos já implementados e as regras a seguir ao acrescentar páginas.

## Estrutura

```text
frontend/src/
├── main.tsx                 # QueryClientProvider + AuthProvider + RouterProvider
├── app/
│   ├── routes.tsx           # mapa de rotas
│   ├── AppLayout.tsx        # cabeçalho + navegação + conteúdo (páginas autenticadas)
│   ├── UserMenu.tsx         # utilizador, escritório, papel e Sair
│   ├── navigation.ts        # secções do menu (preparado para restrição por papel)
│   ├── NotFoundPage.tsx     # 404 dentro do layout
│   └── ErrorPage.tsx        # erro inesperado (errorElement do router)
├── auth/                    # sessão, login, registo, RequireAuth, AuthLayout
├── companies/               # lista, cadastro e detalhe de empresas (US06, US07)
├── components/ApiStatus.tsx # estado da API (GET /health) nas páginas de login e registo
├── shared/
│   ├── api/http.ts          # cliente HTTP, ApiError, aviso de sessão expirada
│   ├── api/queryClient.ts   # configuração do TanStack Query
│   ├── components/          # TextField, PlaceholderPage
│   └── hooks/               # useDocumentTitle, useFormSubmit
├── styles/global.css        # tokens de design
└── test/                    # MSW (server.ts) e renderRoute
```

As pastas dos outros módulos de negócio (`radar/`, `imports/`, …) são criadas quando cada módulo for implementado.

## Rotas

| Rota | Acesso | Conteúdo |
|---|---|---|
| `/login`, `/register` | público (com sessão → página de origem ou `/radar`) | formulários |
| `/` | sessão | redireciona para `/radar` |
| `/radar` | sessão | **página inicial**, "Em construção" |
| `/companies` | sessão | lista de empresas com pesquisa e paginação (pesquisa e página no URL) |
| `/companies/new` | sessão; formulário só para `ADMIN` e `ANALYST` | cadastro de empresa |
| `/companies/:id` | sessão; editar só para `ADMIN` e `ANALYST` | dados da empresa e edição |
| `/imports`, `/audit`, `/settings/*` | sessão | "Em construção" |
| qualquer outra | sessão | 404 dentro do layout |

As páginas "Em construção" não têm dados nem regras de negócio. Para implementar uma secção, troque o `PlaceholderPage` da rota pelo componente do módulo. Rotas de detalhe (`/analyses/:id`, …) entram com cada funcionalidade.

Todas as secções aparecem para todos os papéis (decisão D21). Para restringir uma secção quando a regra for aprovada, acrescente `roles` ao item em `navigation.ts` e proteja também a rota e a API.

## Dados da API (TanStack Query)

- Leituras usam `useQuery` com as chaves de cada módulo (ex.: `companyKeys` em `companies/api.ts`). Depois de gravar, a página atualiza o detalhe no cache e invalida as listas do módulo.
- Erros 4xx não são repetidos; falhas de rede e 5xx tentam mais uma vez.
- O cache é limpo quando deixa de haver sessão, no logout ou quando a sessão expira (regra S24).
- Ações que o papel não permite ficam escondidas (ex.: `canEditCompanies`), mas quem autoriza é a API.

## Layout (mobile-first)

| | Telemóvel (< 48rem / 768px) | Desktop (≥ 48rem) |
|---|---|---|
| Navegação | painel lateral aberto pelo botão **Menu**, por cima do conteúdo com fundo escurecido | barra lateral fixa |
| Cabeçalho | Menu, marca, nome do utilizador (truncado) e Sair | marca, nome, escritório · papel e Sair |

Os estilos base são os do telemóvel; o desktop aplica-se com `@media (min-width: 48rem)`. Cores, espaçamentos e medidas vêm dos tokens em `styles/global.css`. Não há biblioteca de componentes nem de ícones.

## Acessibilidade

- Link **"Saltar para o conteúdo"**: é o primeiro elemento focável e leva o foco ao `<main>`.
- Navegação com `aria-label="Navegação principal"`; a secção atual tem `aria-current="page"`.
- Botão Menu com `aria-expanded` e `aria-controls`. Ao abrir, o foco vai para a primeira secção; **Escape** ou tocar fora fecha e devolve o foco ao botão; escolher uma secção fecha o menu e move o foco para o conteúdo.
- Título do separador por página: `Página · Tribu.io`.
- Campos de formulário com rótulo, `aria-invalid` e mensagem de erro ligada por `aria-describedby`.
- Animações desativadas com `prefers-reduced-motion`.

## Sessão

- O token está num cookie httpOnly; o frontend nunca o lê nem o guarda. Ao carregar, a sessão é restaurada por `GET /auth/me`.
- **Sessão expirada durante o uso** (8h, logout noutro dispositivo):
  - qualquer pedido à API fora de `/auth/*` que receba 401 avisa o `AuthProvider` (`onUnauthorized` em `http.ts`);
  - ao voltar ao separador, a sessão é confirmada com `GET /auth/me`.

  Em ambos os casos, o utilizador vai para `/login` com o aviso "A sua sessão expirou" e, depois de entrar, volta à página onde estava.
- As rotas `/auth/*` ficam fora do aviso global: o 401 delas faz parte do fluxo normal (credenciais erradas, visitante sem sessão).

## Testes

`npm test` (Vitest + Testing Library + MSW). O MSW simula a API ao nível da rede; por omissão não há sessão (`/auth/me` → 401) e cada teste define o que precisa.

| Ficheiro | Cobre |
|---|---|
| `auth/auth.test.tsx` | login, registo, erros por campo, rota protegida, logout |
| `auth/session.test.tsx` | sessão expirada (401 global e ao voltar ao separador), regresso à origem |
| `app/layout.test.tsx` | layout, secções, `aria-current`, títulos, 404, skip link, menu móvel |
| `app/navigation.test.ts` | secções por papel |
| `companies/companies.test.tsx` | lista, pesquisa, paginação, cadastro com erro por campo, edição, VIEWER sem ações, 404, cache limpo ao sair |
| `companies/cnpj.test.ts` | máscara do CNPJ numérico e alfanumérico |
| `app/ErrorPage.test.tsx` | página de erro sem detalhes técnicos |
| `shared/api/http.test.ts` | erros padronizados, 204, aviso de 401 fora de `/auth/*` |
| `components/ApiStatus.test.tsx` | estado da API: online, erro do health check e sem resposta |

O jsdom não aplica CSS: o comportamento responsivo (painel escondido no telemóvel, barra lateral no desktop, lista de empresas em cartões no telemóvel) é verificado no browser a 375px e 1280px.
