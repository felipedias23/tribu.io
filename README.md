# Tribu.io

SaaS Web B2B de inteligência tributária para escritórios de contabilidade.

> **O sistema encontra onde o contador deveria olhar primeiro.**

O Tribu.io funciona como uma camada de inteligência sobre a carteira de empresas do escritório: importa os dados, executa análises tributárias determinísticas e versionadas e prioriza as empresas que merecem atenção (Tax Radar), sempre explicando o porquê. Não é um ERP contábil nem substitui o julgamento do contador.

## Estado

**Semana 1 — arranque e desenho.** Os três serviços (frontend, backend e base de dados) arrancam com `docker compose up` e respondem de ponta a ponta: a página inicial mostra o estado da API, que por sua vez verifica a ligação ao PostgreSQL. O CI executa lint, testes e build em cada Pull Request.

**Semana 2 — persistência, autenticação e layout base (Checkpoint 1).** O banco tem as tabelas do tenant (`accounting_firms`) e dos utilizadores (`users`), com migrations versionadas e seed fictício. A API tem registo, login, logout e sessão (JWT em cookie httpOnly), autorização por papel e isolamento entre escritórios. O frontend tem login, registo e o layout autenticado responsivo, com as secções do produto ainda como páginas "Em construção". As funcionalidades de negócio começam na Semana 3, conforme o [cronograma](docs/arquitetura-e-decisoes.md#8-cronograma-8-semanas-semana-0--2026-09-26).

**Semana 3 — isolamento entre escritórios, empresas e perfil tributário.** Antes da primeira tabela de negócio, o isolamento entre escritórios passou a ter quatro camadas: o escritório vem sempre da sessão; o banco usa FKs compostas com o tenant; o Prisma recusa qualquer query sem o escritório no `where`; e um recurso de outro escritório responde 404, igual a um inexistente. A matriz BOLA, o inventário de rotas e o catálogo do schema verificam estas regras em cada PR ([segurança](docs/seguranca.md)). Com isso vieram as empresas (cadastro, edição, lista paginada e pesquisa por nome ou CNPJ, incluindo o CNPJ alfanumérico) e o perfil tributário de cada empresa, em que um dado em falta fica como "Não informado" e nunca vira zero. O seed passou a ter 12 empresas e 10 perfis tributários. A API recusa arrancar em produção com valores de exemplo e envia cabeçalhos de segurança (`helmet`). Um teste de mutação (43 bugs inseridos de propósito, todos detetados) confirmou que os testes apanham regressões. O Tax Radar, as importações e a auditoria continuam como páginas "Em construção".

**Semana 4 — Tax Engine, análises e Tax Radar (Checkpoint 2).** A primeira regra tributária é o Fator R do Simples Nacional: a tabela dos Anexos III e V foi conferida no texto da LC 123/2006 e está numa versão publicada, com vigência, base legal e checksum, que o banco não deixa alterar nem sobrepor a outra ([§3.4](docs/arquitetura-e-decisoes.md#34-tax-engine-reprodutibilidade)). O cálculo é uma função pura com aritmética decimal: 28% exatos ficam no Anexo III mesmo quando a vírgula flutuante daria 27,999…%, e nenhum valor em falta é inventado. Cada análise grava a entrada, a versão da regra e o raciocínio, não muda depois e pode ser reproduzida; fora do Simples Nacional a regra não se aplica (D31). O Tax Radar, agora a página inicial, classifica a carteira em cinco estados a cada pedido, ordena-a por prioridade e explica cada sinal em português; a explicação de uma análise mostra o cálculo passo a passo, os dados usados e em falta, as premissas e a regra aplicada. Funciona em cartões no telemóvel. O seed tem 30 empresas e cada escritório demonstra os cinco estados. Antes de começar, uma revisão de fragilidades corrigiu cinco pontos (logs sem valores fiscais, erros 500 que deviam ser 400, curingas na pesquisa, verificação de tenant no próprio escritório e corpos só em JSON). Ao longo da semana, 194 bugs inseridos de propósito foram todos detetados pelos testes.

**Semana 5 — importação da carteira e elegibilidade ao Fator R.** Um escritório pode agora importar a carteira a partir de um ficheiro CSV ou XLSX exportado do seu sistema ([§3.6](docs/arquitetura-e-decisoes.md#36-integrações)): o ficheiro de exemplo indica as colunas, e cada linha traz a empresa e, se quiser, o perfil tributário. Antes de gravar, uma prévia separa as linhas em novas, atualizadas (com o antes e o depois), sem alterações, conflitos (CNPJ repetido, código externo de outra empresa) e erros por coluna; conflitos e erros nunca são aplicados, e uma célula vazia não apaga o que já estava gravado. A confirmação volta a verificar tudo numa transação e recusa se a carteira mudou entretanto; a prévia expira em 24 horas e só o resumo fica guardado. O ficheiro é lido com as proteções da regra S17: tamanho e linhas limitados, formato confirmado pelo conteúdo, ZIP-bomb e fórmulas recusadas, e os zeros à esquerda que o Excel apaga no CNPJ recuperados. Antes da importação, o perfil tributário passou a indicar se a atividade está sujeita ao Fator R (D33), em vez de o sistema o presumir, numa versão 2 da regra que deixa as análises antigas reprodutíveis; e todo o conteúdo tributário passou a citar a fonte oficial conferida (D32). Ao longo da semana foram inseridos 116 bugs de propósito: os testes detetaram 115, e o outro não muda o comportamento (é equivalente).

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
| Backend | NestJS 11, TypeScript, REST, Swagger, class-validator, Zod, JWT (`@nestjs/jwt`), argon2, decimal.js, csv-parse, fflate e fast-xml-parser (importação), Jest, Supertest |
| Banco | PostgreSQL 17, Prisma 7 |
| Infra | Docker, Docker Compose, nginx, GitHub Actions |

## Estrutura do projeto

```text
/
├── backend/              API NestJS
│   ├── prisma/           schema.prisma e migrations/
│   ├── src/
│   │   ├── analyses/     execução e consulta das análises (US09, US15)
│   │   ├── auth/         registo, login, sessão, guards e decorators
│   │   ├── common/       formato de erros e validação
│   │   ├── companies/    empresas do escritório e validação do CNPJ
│   │   ├── config/       validação das variáveis de ambiente
│   │   ├── health/       GET /api/v1/health
│   │   ├── imports/      importação por ficheiro: leitura, prévia e confirmação (US12, US13)
│   │   ├── prisma/       ligação ao PostgreSQL, verificação de tenant e seed
│   │   ├── radar/        classificador do Tax Radar e GET /radar (US10)
│   │   ├── tax-calculations/ Tax Engine: evaluator do Fator R, escolha da versão
│   │   ├── tax-profiles/ perfil tributário de cada empresa
│   │   ├── tax-rules/    catálogo de regras, parâmetros e checksum
│   │   └── users/        utilizadores do escritório
│   └── test/             testes e2e (API, banco, isolamento entre tenants, matriz BOLA, regras, Radar, análises, importação) e fixtures/
├── frontend/             aplicação React
│   └── src/              app/ (rotas e layout), auth/ (sessão e páginas), companies/ (empresas e perfil tributário), radar/, analyses/, imports/, shared/
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

Entre em <http://localhost:8080/login> com uma destas contas, ou crie um escritório novo em `/register`. Depois do login, a aplicação abre no Tax Radar. Cada escritório tem 15 empresas fictícias que cobrem os cinco estados do Radar; as contas `ADMIN` e `ANALYST` podem executar análises na ficha de cada empresa e importar empresas em **Importações** (há um ficheiro de exemplo na página).

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
- [ADR 0001: PostgreSQL com Prisma](docs/adr/0001-postgresql-prisma.md)
- [Modelo de dados (diagrama ER)](docs/modelo-dados.md)
- [User stories do MVP](docs/user-stories.md)
- [Padrão de desenvolvimento seguro](docs/seguranca.md)
- [Autenticação, tenant e papéis](docs/autenticacao.md)
- [Banco de dados: estrutura, migrations e seed](docs/banco-de-dados.md)
- [Frontend: layout base, rotas e sessão](docs/frontend.md)
- [Diretrizes de desenvolvimento](docs/CLAUDE.md)

### Referência

- [Definição do produto](docs/definicao-do-produto.md)

### Histórico

- [Instruções da fase de análise](docs/instrucoes-fase-analise.md)
