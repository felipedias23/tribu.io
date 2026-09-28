# Tribu.io

SaaS Web B2B de inteligência tributária para escritórios de contabilidade.

> **O sistema encontra onde o contador deveria olhar primeiro.**

O Tribu.io funciona como uma camada de inteligência sobre a carteira de empresas do escritório: importa os dados, executa análises tributárias determinísticas e versionadas e prioriza as empresas que merecem atenção (Tax Radar), sempre explicando o porquê. Não é um ERP contábil nem substitui o julgamento do contador.

## Estado

**Semana 1 — arranque e desenho.** Os três serviços (frontend, backend e base de dados) arrancam com `docker compose up` e respondem de ponta a ponta: a página inicial mostra o estado da API, que por sua vez verifica a ligação ao PostgreSQL. O CI executa lint, testes e build em cada Pull Request.

**Semana 2 — persistência, autenticação e layout base (Checkpoint 1).** O banco tem as tabelas do tenant (`accounting_firms`) e dos utilizadores (`users`), com migrations versionadas e seed fictício. A API tem registo, login, logout e sessão (JWT em cookie httpOnly), autorização por papel e isolamento entre escritórios. O frontend tem login, registo e o layout autenticado responsivo, com as secções do produto ainda como páginas "Em construção". As funcionalidades de negócio começam na Semana 3, conforme o [cronograma](docs/arquitetura-e-decisoes.md#8-cronograma-8-semanas-semana-0--2026-09-26).

## Arquitetura

Monólito modular com três serviços em containers separados:

```text
navegador ──► frontend (nginx) ──/api──► backend (NestJS) ──► db (PostgreSQL 17)
```

- **frontend** — build do React servido por nginx, que também faz proxy de `/api` para o backend (mesma origem). Layout, rotas e sessão: [docs/frontend.md](docs/frontend.md).
- **backend** — API REST NestJS em `/api/v1`, documentada com Swagger em `/api/docs`. Autenticação, tenant e papéis: [docs/autenticacao.md](docs/autenticacao.md).
- **db** — PostgreSQL 17 com volume persistente. Estrutura, migrations e seed: [docs/banco-de-dados.md](docs/banco-de-dados.md).

Decisões e modelo de dados planejado: [arquitetura e decisões](docs/arquitetura-e-decisoes.md).

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Vitest, Testing Library, MSW |
| Backend | NestJS 11, TypeScript, REST, Swagger, class-validator, JWT (`@nestjs/jwt`), argon2, Jest, Supertest |
| Banco | PostgreSQL 17, Prisma 7 |
| Infra | Docker, Docker Compose, nginx, GitHub Actions |

## Estrutura do projeto

```text
/
├── backend/              API NestJS
│   ├── prisma/           schema.prisma e migrations/
│   ├── src/
│   │   ├── auth/         registo, login, sessão, guards e decorators
│   │   ├── common/       formato de erros e validação
│   │   ├── config/       validação das variáveis de ambiente
│   │   ├── health/       GET /api/v1/health
│   │   ├── prisma/       ligação ao PostgreSQL e seed
│   │   └── users/        utilizadores do escritório
│   └── test/             testes e2e (API, banco, isolamento entre tenants)
├── frontend/             aplicação React
│   └── src/              app/ (rotas e layout), auth/ (sessão e páginas), shared/
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
| Documentação da API (Swagger) | <http://localhost:8080/api/docs> |

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

Entre em <http://localhost:8080/login> com uma destas contas, ou crie um escritório novo em `/register`. Depois do login, a aplicação abre no Tax Radar.

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

O [índice da documentação](docs/README.md) indica o estado de cada documento e qual prevalece em caso de divergência.

### Vigentes

- [Regras do projeto académico](docs/regras-academicas.md)
- [Arquitetura e decisões (relatório técnico da Fase 1, aprovado)](docs/arquitetura-e-decisoes.md)
- [Padrão de desenvolvimento seguro](docs/seguranca.md)
- [Autenticação, tenant e papéis](docs/autenticacao.md)
- [Banco de dados: estrutura, migrations e seed](docs/banco-de-dados.md)
- [Frontend: layout base, rotas e sessão](docs/frontend.md)
- [Diretrizes de desenvolvimento](docs/CLAUDE.md)

### Referência

- [Definição do produto](docs/definicao-do-produto.md)

### Histórico

- [Instruções da fase de análise](docs/instrucoes-fase-analise.md)
