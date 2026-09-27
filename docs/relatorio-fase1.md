# Relatório Técnico — Fase 1 (Análise e Arquitetura)

> Status: **aprovado** em 2026-09-26. Decisões D10–D14 aprovadas em 2026-09-27 (autenticação, semana 2).
> Fontes: [product-definition.md](product-definition.md), [etapa01.md](etapa01.md), [REGRAS.md](REGRAS.md), [CLAUDE.md](CLAUDE.md).

## 1. Estado inicial

- Repositório vazio (apenas `CLAUDE.md` e `REGRAS.md`), sem commits nem remote.
- Ambiente: Fedora 44, Node.js 22.23.1, npm 10.9.8, Git 2.55.0, OpenSSL 3.5.8.
- Docker/Compose ausentes (Podman 5.8.7 presente, sem provider de compose) → decisão D1.

## 2. Decisões

| # | Decisão | Resolução |
|---|---|---|
| D1 | Runtime de containers | Docker Engine + Compose plugin |
| D2 | Repositório | Monorepo; a raiz corresponde ao `product/` da especificação; branch principal `main` |
| D3 | Primeira regra tributária | Simples Nacional — Fator R (Anexo III × V) e alíquota efetiva |
| D4 | Papéis | `ADMIN`, `ANALYST`, `VIEWER` |
| D5 | Onboarding | Registo público cria `AccountingFirm` + primeiro `ADMIN` (exigência do REGRAS.md) |
| D6 | Entidades | Criar `ImportBatch`; `AnalysisInput` vira `inputSnapshot` (JSONB) em `Analysis` |
| D7 | Sessão | JWT em cookie httpOnly, `SameSite=Strict`, ~8h, sem refresh token; logout invalida via `tokenVersion` |
| D8 | Deploy público | Origem única: o mesmo domínio serve o frontend e faz proxy de `/api` (exigido por D7). Fornecedor a decidir na semana 3 (candidatos: Render, Railway) |
| D9 | Documentação | Especificações versionadas em `docs/` em Markdown |
| D10 | Autenticação (semana 2) | `@nestjs/jwt` com guard próprio, sem Passport; tenant e papel lidos da BD a cada pedido (JWT só com `sub` e `tv`) |
| D11 | Password | 8 a 128 caracteres, sem regras de composição (NIST 800-63B) |
| D12 | Registo | 409 para email já registado; o registo já inicia sessão |
| D13 | Papéis | Só `ADMIN` altera utilizadores; o escritório nunca fica sem `ADMIN`. Restantes permissões definidas com cada funcionalidade |
| D14 | Isolamento na semana 2 | `GET /users` e `PATCH /users/:id` servem de recurso para os testes A/B |
| — | Banco | PostgreSQL + Prisma (justificativa em ADR na semana 1) |
| — | Forma de trabalho | Projeto individual; PRs revistos pelo professor; Conventional Commits |

## 3. Arquitetura

### 3.1 Estrutura

```
/
├── backend/            NestJS (monólito modular)
├── frontend/           React + Vite
├── infra/docker/       Dockerfiles, nginx.conf
├── infra/scripts/      entrypoint (migrate + seed)
├── docs/
├── .github/workflows/  ci.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

Três serviços em containers separados: `frontend` (nginx servindo o build e fazendo proxy de `/api`), `backend` e `db` (PostgreSQL 17). `docker compose up` aplica migrations e seed fictício automaticamente.

### 3.2 Backend

Módulos: `common`, `config`, `prisma`, `auth`, `users`, `accounting-firms`, `companies`, `tax-profiles`, `integrations`, `tax-rules`, `tax-calculations` (Tax Engine), `radar`, `analyses`, `simulations`, `audit`, `health`.

- Controllers: validação de DTO, autorização, delegação.
- Services: orquestração; recebem sempre `tenantId`.
- Tax Engine e classificador do Radar: funções puras (sem I/O, sem Nest/Prisma).
- Dependências: `@nestjs/config` + `zod`, `class-validator`, `@nestjs/swagger`, `@nestjs/jwt` (sem `passport-jwt`, D10), `argon2`, `@nestjs/throttler`, `helmet`, `cookie-parser`, `nestjs-pino`, `exceljs`, `csv-parse`, `supertest` (dev).

### 3.3 Multi-tenancy

Schema compartilhado com `accountingFirmId` em toda entidade do tenant. Isolamento em 4 camadas:

1. `tenantId` vem **apenas** da sessão autenticada (`@CurrentTenant()`, tipo `TenantId`), nunca do request. O guard identifica o utilizador pelo JWT e lê o tenant na BD (D10).
2. Todo acesso filtra por `{ id, accountingFirmId }`; recurso de outro tenant → **404**.
3. FKs compostas `(companyId, accountingFirmId)` → `Company(id, accountingFirmId)` impedem referências cruzadas no próprio banco.
4. Testes e2e com dois escritórios para cada recurso.

RLS do PostgreSQL fica como endurecimento futuro.

### 3.4 Tax Engine (reprodutibilidade)

- `TaxRule` (catálogo global) → `TaxRuleVersion` (`version`, `validFrom`, `validUntil`, `parameters` JSONB, `source`, `evaluatorKey`, `status`, `checksum`).
- Lógica em evaluators TypeScript puros registrados por chave (ex.: `SIMPLES_FATOR_R@1`); parâmetros em dados. Sem DSL.
- Versões publicadas e evaluators publicados são imutáveis; mudanças geram nova versão/chave.
- Seleção pela versão `PUBLISHED` vigente no período; constraint `EXCLUDE` impede sobreposição; sem versão vigente → `REVISAR_REGRA`.
- `Analysis` é imutável e grava snapshot de entrada, versão da regra, checksum dos parâmetros, versão do engine, resultado, trace, ausências, premissas, executor e data.
- Teste de replay garante resultado idêntico. Dados ausentes → `INCOMPLETE`; nada é inventado. Nenhum LLM participa.

### 3.5 Tax Radar

Classificação derivada (não é entidade), função pura com precedência fixa:

1. `DADOS_INCOMPLETOS` — sem perfil ou campos obrigatórios ausentes.
2. `REVISAR_REGRA` — sem versão vigente ou análise feita com versão substituída.
3. `REQUER_ANALISE` — dados inconsistentes, desatualizados ou limite do regime excedido.
4. `OPORTUNIDADE_PARA_AVALIAR` — ex.: Fator R próximo do limiar ou anexo divergente.
5. `NORMAL`.

Cada sinal traz `reasons[]` (`code`, `message`, regra, versão, dados usados, ausências, premissas) e um `priorityScore` determinístico. Limiares são parâmetros da versão da regra.

### 3.6 Integrações

`Fonte → Parser → Normalização → Validação → Deduplicação → Mapeamento → Prévia → Confirmação → Domínio`.

- `CompanySourceAdapter` com `CsvAdapter` e `XlsxAdapter`; conectores futuros implementam a mesma interface.
- CNPJ validado (numérico e alfanumérico — IN RFB 2.229/2024).
- Deduplicação: mapeamento externo → CNPJ no tenant → novo; duplicidades/contradições → conflito (nunca aplicado automaticamente).
- `ImportBatch` guarda prévia e resumo; confirmação transacional; limites de tamanho e linhas.

## 4. Modelo de dados

| Entidade | Chaves / constraints principais |
|---|---|
| AccountingFirm | `cnpj` único (opcional) |
| User | `email` único (minúsculas); índice `accountingFirmId`; `role`, `tokenVersion` |
| Company | únicos `(accountingFirmId, cnpj)` e `(id, accountingFirmId)`; índice `(accountingFirmId, legalName)` |
| TaxProfile | 1:1 com Company (`companyId` único); FK composta; CHECK valores ≥ 0 |
| TaxRule | `code` único |
| TaxRuleVersion | único `(taxRuleId, version)`; CHECK `validUntil > validFrom`; EXCLUDE sobreposição |
| Analysis | FK composta; índices `(accountingFirmId, companyId, executedAt DESC)`, `(accountingFirmId, radarStatus)` |
| Simulation | FK composta; 1:N SimulationScenario |
| SimulationScenario | único `(simulationId, label)` |
| AuditLog | append-only; índice `(accountingFirmId, createdAt DESC)` |
| Integration | único `(accountingFirmId, type, name)` |
| ExternalCompanyMapping | únicos `(integrationId, externalId)`, `(integrationId, companyId)` |
| ImportBatch | índice `(accountingFirmId, createdAt DESC)` |

Valores monetários em `Decimal(15,2)`. IDs UUID. Migrations via Prisma Migrate (SQL adicional para CHECK/EXCLUDE). Seed idempotente e fictício: 2 escritórios, um usuário por papel, ~30 empresas cobrindo todos os estados do Radar, primeira regra publicada; senhas de demonstração via variáveis de ambiente.

## 5. API (`/api/v1`, Swagger em `/api/docs`)

| Módulo | Endpoints |
|---|---|
| auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| accounting-firms | `GET`, `PATCH /accounting-firm` |
| users | `GET /users`, `POST /users`, `PATCH /users/:id` |
| companies | `GET /companies`, `POST /companies`, `GET /companies/:id`, `PATCH /companies/:id` |
| tax-profiles | `GET`, `PUT /companies/:id/tax-profile` |
| integrations | `POST /imports`, `GET /imports`, `GET /imports/:id`, `POST /imports/:id/confirm`, `POST /imports/:id/cancel` |
| tax-rules | `GET /tax-rules`, `GET /tax-rules/:id/versions` |
| analyses | `POST /companies/:id/analyses`, `GET /companies/:id/analyses`, `GET /analyses/:id` |
| radar | `GET /radar`, `GET /radar/summary` |
| simulations | `POST /companies/:id/simulations`, `GET /companies/:id/simulations`, `GET /simulations/:id` |
| audit | `GET /audit-logs` |
| health | `GET /health` |

Erros em formato padronizado com detalhes por campo, exibidos de forma clara no front-end.

## 6. Frontend

React Router, TanStack Query, `AuthContext`, CSS Modules, layout **responsivo mobile-first** (Radar em cartões no telemóvel). Testes com Vitest, Testing Library e MSW.

Rotas: `/login`, `/register`, `/radar` (inicial), `/companies`, `/companies/:id`, `/analyses/:id`, `/companies/:id/simulations/new`, `/simulations/:id`, `/imports`, `/imports/new`, `/settings/*`, `/audit`.

## 7. Testes, Docker e CI

- Backend (~40): engine, replay, radar, CNPJ, pipeline de importação (unit); auth, papéis, **isolamento entre tenants**, empresas, importação, análise, simulação, auditoria (e2e com PostgreSQL real).
- Frontend (~8): login, registo, rota protegida, Radar, prévia de importação, simulação.
- CI (`pull_request` e `push` para `main`): backend (lint, unit, e2e, build), frontend (lint, typecheck, test, build), `docker compose build`.

## 8. Cronograma (8 semanas, semana 0 = 2026-09-26)

| Sem. | Entrega |
|---|---|
| 0 | Repositório, Trello, convite ao professor, dados enviados; especificações em `docs/` |
| 1 | User stories no Trello, diagrama ER, ADR PostgreSQL, compose com 3 serviços "hello world", CI inicial |
| 2 | **Checkpoint 1** — Prisma, migrations, seed, registo/login/logout, tenant e papéis, testes de isolamento, layout base |
| 3 | Company + TaxProfile ponta a ponta; primeiro deploy público |
| 4 | **Checkpoint 2** — Tax Engine, Analysis, Radar com explicação |
| 5 | Importação CSV/XLSX com prévia e confirmação |
| 6 | Simulações, histórico, auditoria — **feature freeze** |
| 7 | Testes, CI verde, deploy final, acessibilidade, revisão de segurança |
| 8 | Bugfix, README com screenshots, vídeo de 3 min, demo |

Se houver tempo: análise da carteira em lote, tela de auditoria, gestão de usuários além do ADMIN inicial, consulta de versões de regras.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Conteúdo tributário incorreto | Parâmetros e fonte legal versionados; resultados como suporte à decisão |
| Mudanças legais (Reforma Tributária) | Versionamento com validade temporal |
| Falsa precisão | Premissas e ausências sempre visíveis; simulações rotuladas como estimativa |
| Vazamento entre tenants | Defesa em 4 camadas + testes e2e |
| Prazo de 8 semanas | Escopo priorizado; deploy antecipado |
| Upload malicioso | Limites de tamanho/linhas, parsers seguros |
