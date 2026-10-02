# Tribu.io

SaaS Web B2B de inteligência tributária para escritórios de contabilidade.

> **O sistema encontra onde o contador deveria olhar primeiro.**

O Tribu.io funciona como uma camada de inteligência sobre a carteira de empresas do escritório: importa os dados, executa análises tributárias determinísticas e versionadas e prioriza as empresas que merecem atenção (Tax Radar), sempre explicando o porquê. Não é um ERP contábil nem substitui o julgamento do contador.

## Estado

**Semana 1 — arranque e desenho.** Os três serviços (frontend, backend e base de dados) arrancam com `docker compose up` e respondem de ponta a ponta: a página inicial mostra o estado da API, que por sua vez verifica a ligação ao PostgreSQL. O CI executa lint, testes e build em cada Pull Request.

**Semana 2 — persistência.** O banco tem as tabelas do tenant (`accounting_firms`) e dos utilizadores (`users`), com migrations versionadas e um seed fictício. Ao arrancar, o backend aplica as migrations e executa o seed. Autenticação e layout base são as próximas etapas da semana, conforme o [cronograma](docs/relatorio-fase1.md#8-cronograma-8-semanas-semana-0--2026-09-26).

## Arquitetura

Monólito modular com três serviços em containers separados:

```text
navegador ──► frontend (nginx) ──/api──► backend (NestJS) ──► db (PostgreSQL 17)
```

- **frontend** — build do React servido por nginx, que também faz proxy de `/api` para o backend (mesma origem).
- **backend** — API REST NestJS em `/api/v1`. Nesta fase expõe `GET /api/v1/health`, que confirma a ligação ao banco.
- **db** — PostgreSQL 17 com volume persistente. Estrutura, migrations e seed: [docs/banco-de-dados.md](docs/banco-de-dados.md).

Decisões e modelo de dados planejado: [relatório técnico da Fase 1](docs/relatorio-fase1.md).

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Vitest, Testing Library |
| Backend | NestJS 11, TypeScript, REST, Jest, Supertest |
| Banco | PostgreSQL 17, Prisma 7 |
| Infra | Docker, Docker Compose, nginx, GitHub Actions |

## Estrutura do projeto

```text
/
├── backend/              API NestJS
│   ├── prisma/           schema.prisma e migrations/
│   ├── src/
│   │   ├── config/       validação das variáveis de ambiente
│   │   ├── health/       GET /api/v1/health
│   │   └── prisma/       ligação ao PostgreSQL e seed
│   └── test/             testes e2e (API e banco)
├── frontend/             aplicação React
│   └── src/
├── infra/docker/         Dockerfiles e nginx.conf
├── infra/scripts/        entrypoint do backend (migrations + seed)
├── docs/                 especificações do projeto
├── .github/workflows/    CI
├── docker-compose.yml
└── .env.example
```

## Requisitos

- Docker Engine com o plugin Docker Compose v2
- Para desenvolvimento fora do Docker: Node.js 22 (≥ 22.22, ver `.nvmrc`) e npm 10

## Como iniciar

```bash
cp .env.example .env
docker compose up --build
```

| Serviço | URL |
| --- | --- |
| Aplicação | <http://localhost:8080> |
| Health check da API | <http://localhost:8080/api/v1/health> |

O backend só arranca depois de o PostgreSQL estar saudável e o frontend depois de o backend estar saudável. Ao arrancar, o backend aplica as migrations pendentes e, com `SEED_ON_START=true`, executa o seed. Para parar: `docker compose down` (acrescente `-v` para apagar também os dados do banco).

### Desenvolvimento local

```bash
cp .env.example .env
docker compose up -d db          # apenas o PostgreSQL

cd backend && npm install
npm run db:migrate:deploy && npm run db:seed      # estrutura e dados fictícios
npm run start:dev                                 # http://localhost:3000/api/v1/health
cd frontend && npm install && npm run dev         # http://localhost:5173 (proxy /api → :3000)
```

As variáveis de ambiente estão documentadas em [.env.example](.env.example) e em [docs/banco-de-dados.md](docs/banco-de-dados.md#variáveis-de-ambiente). O `.env` real nunca é versionado.

## Contas de teste

O seed cria dois escritórios fictícios, cada um com uma conta por papel. A password de todas é o valor de `SEED_PASSWORD` no `.env`.

| Escritório | Email | Papel |
| --- | --- | --- |
| Alfa Contabilidade | `admin@alfa.tribu.example` | ADMIN |
| Alfa Contabilidade | `analista@alfa.tribu.example` | ANALYST |
| Alfa Contabilidade | `consulta@alfa.tribu.example` | VIEWER |
| Beta Contabilidade | `admin@beta.tribu.example` | ADMIN |
| Beta Contabilidade | `analista@beta.tribu.example` | ANALYST |
| Beta Contabilidade | `consulta@beta.tribu.example` | VIEWER |

O login será disponibilizado na próxima etapa da Semana 2.

## Testes

```bash
cd backend
npm run lint && npm run typecheck && npm test && npm run build
npm run db:migrate:deploy && npm run test:e2e   # requer o PostgreSQL (docker compose up -d db)

cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

O CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) executa estes passos em cada Pull Request e push para `main`, além do `docker compose build`.

## Documentação

- [Definição do produto](docs/product-definition.md)
- [Banco de dados: estrutura, migrations e seed](docs/banco-de-dados.md)
- [Relatório técnico — Fase 1 (aprovado)](docs/relatorio-fase1.md)
- [Instruções da Etapa 01](docs/etapa01.md)
- [Regras do projeto académico](docs/REGRAS.md)
- [Diretrizes de desenvolvimento](docs/CLAUDE.md)
