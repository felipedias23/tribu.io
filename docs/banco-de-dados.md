# Banco de dados

PostgreSQL 17 com Prisma 7. O modelo completo planeado para o MVP está no [relatório técnico §4](arquitetura-e-decisoes.md#4-modelo-de-dados); aqui fica o que **já existe** no banco e como operá-lo.

## Estado atual

Semana 4: o tenant, os utilizadores, as empresas, os perfis tributários e o catálogo de regras tributárias. As outras entidades (Analysis, …) entram por migration na semana da respetiva funcionalidade.

| Tabela | Modelo Prisma | Finalidade |
|---|---|---|
| `accounting_firms` | `AccountingFirm` | Escritório de contabilidade; é o **tenant** |
| `users` | `User` | Utilizador de um escritório, com papel `ADMIN`, `ANALYST` ou `VIEWER` |
| `companies` | `Company` | Empresa cliente do escritório (US06) |
| `tax_profiles` | `TaxProfile` | Dados tributários de uma empresa, 1:1 (US08) |
| `tax_rules` | `TaxRule` | Catálogo **global** de regras tributárias (§3.4); não pertence a um escritório |
| `tax_rule_versions` | `TaxRuleVersion` | Versões de cada regra, com vigência, parâmetros e checksum (§3.4, D28) |

Tabelas e colunas em `snake_case` no PostgreSQL (`@@map`/`@map`); no código TypeScript os nomes ficam em `camelCase`.

### `accounting_firms`

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `name` | `text` | obrigatório, não vazio (`CHECK`) |
| `cnpj` | `char(14)` | opcional, único; 12 alfanuméricos + 2 dígitos, sem pontuação (`CHECK`) |
| `created_at`, `updated_at` | `timestamptz(3)` | preenchidos automaticamente |

### `users`

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `accounting_firm_id` | `uuid` | FK → `accounting_firms.id`, obrigatório, indexado |
| `name` | `text` | obrigatório, não vazio (`CHECK`) |
| `email` | `text` | único em todo o sistema; só minúsculas (`CHECK`) |
| `password_hash` | `text` | hash argon2id; a password em texto nunca é guardada |
| `role` | enum `role` | `ADMIN`, `ANALYST`, `VIEWER` |
| `token_version` | `integer` | padrão 0, ≥ 0 (`CHECK`); incrementado no logout |
| `created_at`, `updated_at` | `timestamptz(3)` | preenchidos automaticamente |

### `companies`

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `accounting_firm_id` | `uuid` | FK → `accounting_firms.id`, obrigatório |
| `cnpj` | `char(14)` | obrigatório, único no escritório; 12 alfanuméricos + 2 dígitos, sem pontuação (`CHECK`) |
| `legal_name` | `text` | razão social; obrigatória, não vazia (`CHECK`); collation `pt-BR-x-icu` |
| `trade_name` | `text` | nome fantasia; opcional, `NULL` em vez de texto vazio (`CHECK`) |
| `created_at`, `updated_at` | `timestamptz(3)` | preenchidos automaticamente |

### `tax_profiles`

Todos os campos tributários aceitam `NULL`, que significa **dado ausente**, diferente de zero (decisão D20). As restrições só se aplicam quando há valor.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `accounting_firm_id` | `uuid` | obrigatório, indexado; parte da FK composta para `companies` |
| `company_id` | `uuid` | obrigatório; um perfil por empresa |
| `tax_regime` | enum `tax_regime` | `SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL` |
| `cnae` | `char(7)` | 7 dígitos sem pontuação (`CHECK`) |
| `city` | `text` | nome do município, não vazio (`CHECK`) |
| `state` | `char(2)` | uma das 27 UFs (`CHECK`) |
| `revenue_12m` | `decimal(15,2)` | receita bruta dos 12 meses anteriores ao período (RBT12), ≥ 0 (`CHECK`) |
| `payroll_12m` | `decimal(15,2)` | folha dos mesmos 12 meses, ≥ 0 (`CHECK`) |
| `reference_period` | `date` | mês de referência, sempre o 1.º dia (`CHECK`); a API aceita anos de 1900 a 2099 |
| `created_at`, `updated_at` | `timestamptz(3)` | preenchidos automaticamente |

### `tax_rules` e `tax_rule_versions`

Catálogo global, igual para todos os escritórios. Não tem endpoint de escrita: muda só por migration (regra S11), e a verificação do Prisma recusa escritas pela API. A versão 1 do Fator R (D28) é inserida pela migration `20261009185650_simples_fator_r_v1`, porque é um dado de referência que tem de existir também em produção, onde o seed não corre.

| Coluna | Tipo | Regras |
|---|---|---|
| `tax_rules.code` | `text` | único; maiúsculas, dígitos e `_` (`CHECK`), ex.: `SIMPLES_FATOR_R` |
| `tax_rules.name`, `description` | `text` | obrigatórios |
| `tax_rule_versions.tax_rule_id` | `uuid` | FK → `tax_rules.id`, `ON DELETE RESTRICT` |
| `version` | `integer` | ≥ 1; único por regra |
| `valid_from` | `date` | primeiro dia de vigência |
| `valid_until` | `date` | **exclusivo**: primeiro dia em que já não vale; `NULL` = sem fim. `CHECK valid_until > valid_from` |
| `parameters` | `jsonb` | objeto (`CHECK`); decimais em texto. Validado na aplicação com Zod ([`simples-fator-r.parameters.ts`](../backend/src/tax-rules/simples-fator-r.parameters.ts)) |
| `source` | `text` | base legal, não vazia |
| `evaluator_key` | `text` | `CÓDIGO@N` (`CHECK`), ex.: `SIMPLES_FATOR_R@1` |
| `status` | enum `tax_rule_version_status` | `DRAFT`, `PUBLISHED`, `SUPERSEDED` |
| `checksum` | `char(64)` | SHA-256 em hexadecimal do JSON canónico dos parâmetros ([`checksum.ts`](../backend/src/tax-rules/checksum.ts)) |

**Uma versão publicada por dia:** `tax_rule_versions_published_no_overlap` é uma restrição `EXCLUDE` sobre `(tax_rule_id, daterange(valid_from, valid_until, '[)'))`, só entre versões `PUBLISHED`. Usa a extensão `btree_gist`, que é confiável (não exige superuser).

**Imutabilidade (§3.4):** o trigger `tax_rule_versions_guard_immutable` recusa alterar uma versão que já saiu de `DRAFT`. As únicas mudanças aceites são passar de `PUBLISHED` a `SUPERSEDED` e fechar a vigência (`valid_until` de `NULL` para uma data). Uma versão publicada ou substituída também não pode ser apagada. Para mudar parâmetros, publica-se uma versão nova.

### Restrições

| Nome | Tipo | Motivo |
|---|---|---|
| `users_accounting_firm_id_fkey` | FK, `ON DELETE RESTRICT` | Todo utilizador pertence a um escritório existente; um escritório com utilizadores não pode ser apagado por engano |
| `users_email_key` | único | Login só com email e password, antes de conhecer o tenant (relatório §4) |
| `users_email_lowercase_check` | `CHECK` | A unicidade não depende de maiúsculas; a aplicação normaliza o email antes de gravar |
| `users_token_version_non_negative_check` | `CHECK` | Contador de invalidação de sessões (decisão D7) |
| `accounting_firms_cnpj_key` | único | Um CNPJ identifica um único escritório |
| `accounting_firms_cnpj_format_check` | `CHECK` | Formato numérico e alfanumérico (IN RFB 2.229/2024); os dígitos verificadores são validados na aplicação |
| `*_name_not_blank_check` | `CHECK` | Nomes não podem ser só espaços |
| `users_accounting_firm_id_idx` | índice | Consultas filtradas por tenant |
| `companies_accounting_firm_id_fkey` | FK, `ON DELETE RESTRICT` | Toda empresa pertence a um escritório existente |
| `companies_accounting_firm_id_cnpj_key` | único | O CNPJ não se repete dentro do escritório; noutro escritório é aceite (regra S9) |
| `companies_id_accounting_firm_id_key` | único | Alvo das FKs compostas das tabelas filhas (decisão D15) |
| `companies_cnpj_format_check` | `CHECK` | Mesmo formato do CNPJ do escritório; os dígitos verificadores são validados na aplicação |
| `companies_trade_name_not_blank_check` | `CHECK` | Sem nome fantasia, o valor é `NULL` |
| `companies_accounting_firm_id_legal_name_idx` | índice | Listagem do escritório ordenada por razão social |
| `tax_profiles_company_id_accounting_firm_id_fkey` | FK composta, `ON DELETE RESTRICT` | O perfil e a empresa são sempre do mesmo escritório (decisão D15) |
| `tax_profiles_company_id_accounting_firm_id_key` | único | Um perfil por empresa. A ordem das colunas é a da FK, uma exigência do Prisma para relações 1:1 |
| `tax_profiles_accounting_firm_id_idx` | índice | Índice que começa pelo tenant (regra S7) |
| `tax_profiles_*_check` | `CHECK` | CNAE, UF, valores não negativos e mês de referência |
| `tax_rule_versions_published_no_overlap` | `EXCLUDE` | Duas versões publicadas da mesma regra nunca valem no mesmo dia |
| `tax_rule_versions_*_check`, `tax_rules_*_check` | `CHECK` | Vigência, número da versão, formato do código, do evaluator e do checksum, parâmetros como objeto |
| `tax_rule_versions_guard_immutable` | trigger | Versões publicadas imutáveis e não apagáveis |

## Decisões de modelagem

- **UUID gerado no banco** (`gen_random_uuid()`, nativo no PostgreSQL 17): IDs não sequenciais, que não revelam volume de dados, e inserções por SQL puro também recebem ID.
- **Email único global** e não por escritório: o login recebe apenas email e password, por isso o email tem de identificar um único utilizador.
- **`ON DELETE RESTRICT`** entre utilizador e escritório: apagar um tenant exige remover primeiro os seus dados, de forma explícita.
- **Sem campo de estado (`status`) no utilizador:** não está definido nos documentos aprovados.
- **Isolamento entre tenants.** Toda tabela do tenant tem `accounting_firm_id`, e as consultas devem filtrar sempre por `{ id, accountingFirmId }`. A primeira **FK composta** é `tax_profiles (company_id, accounting_firm_id)` → `companies(id, accounting_firm_id)` (relatório §3.3): o banco recusa um perfil ligado a uma empresa de outro escritório. A tabela `users` recebe `UNIQUE (id, accounting_firm_id)` na migration da primeira tabela que a referencie (`analyses`, semana 4), para servir de alvo às FKs compostas ([modelo de dados](modelo-dados.md#restrições-e-índices)). Toda tabela nova segue as regras de schema do tenant (decisão D15, [seguranca.md](seguranca.md#schema-d15)), verificadas por um teste de catálogo do schema.
- **Ordenação em português:** a collation do banco ordena pelo valor binário (maiúsculas antes de minúsculas, acentos no fim). A razão social usa a collation ICU `pt-BR-x-icu`, aplicada por SQL na migration porque o Prisma não a expressa.
- **`CHECK`, `EXCLUDE` e triggers em SQL manual:** o Prisma não os expressa, por isso estão escritos no fim do `migration.sql`, numa secção identificada. O `prisma migrate diff` do CI ignora-os e continua sem diferenças.

## Migrations

Ficam em [`backend/prisma/migrations/`](../backend/prisma/migrations/) e são versionadas no Git. **Nunca** use `prisma db push` nem altere o banco à mão.

| Migration | Finalidade |
|---|---|
| `20260927125723_init_tenants_users` | Enum `role`, tabelas `accounting_firms` e `users`, índices, FK e restrições `CHECK` |
| `20261003114532_companies` | Tabela `companies`: unicidade do CNPJ no escritório, `UNIQUE (id, accounting_firm_id)` para as FKs compostas e restrições `CHECK` |
| `20261003114937_companies_legal_name_collation` | Razão social com a collation `pt-BR-x-icu` (ordenação em português) |
| `20261003150505_tax_profiles` | Enum `tax_regime` e tabela `tax_profiles`, com FK composta para `companies` e restrições `CHECK` |
| `20261009185649_tax_rules` | Enum `tax_rule_version_status`, tabelas `tax_rules` e `tax_rule_versions`, extensão `btree_gist`, `EXCLUDE` de sobreposição, `CHECK` e trigger de imutabilidade |
| `20261009185650_simples_fator_r_v1` | Regra `SIMPLES_FATOR_R` e a sua versão 1 publicada (D28, §3.4.1) |

Comandos (a partir de `backend/`, com o PostgreSQL a correr: `docker compose up -d db`):

| Comando | Quando usar |
|---|---|
| `npm run db:migrate:dev -- --name <nome>` | Criar uma migration nova depois de alterar `schema.prisma` (desenvolvimento) |
| `npm run db:migrate:dev -- --create-only --name <nome>` | Criar a migration sem aplicar, para acrescentar SQL manual (`CHECK`, `EXCLUDE`) |
| `npm run db:migrate:deploy` | Aplicar migrations pendentes (CI, containers, produção) |
| `npm run db:migrate:status` | Ver quais migrations estão aplicadas |
| `npm run prisma:generate` | Regenerar o Prisma Client (o `migrate dev` do Prisma 7 não o faz sozinho) |

O CI aplica as migrations num banco vazio e corre `prisma migrate diff --exit-code` para falhar se o `schema.prisma` tiver alterações sem migration.

## Seed

[`backend/src/prisma/seed.ts`](../backend/src/prisma/seed.ts) cria dados **fictícios, determinísticos e idempotentes**. Cada registo tem um ID fixo e é atualizado (`upsert`) pela sua chave única, por isso reexecutar o seed não duplica nada.

```bash
cd backend
npm run db:seed        # compila e executa `prisma db seed`
```

No Docker Compose, o entrypoint do backend aplica as migrations e, com `SEED_ON_START=true`, executa o seed a cada arranque.

### Contas de desenvolvimento

Todas usam a password definida em `SEED_PASSWORD` no `.env`. Os emails usam o domínio reservado `.example` (RFC 2606) e os escritórios não têm CNPJ, para não coincidirem com dados reais.

| Escritório | Email | Papel |
|---|---|---|
| Alfa Contabilidade | `admin@alfa.tribu.example` | `ADMIN` |
| Alfa Contabilidade | `analista@alfa.tribu.example` | `ANALYST` |
| Alfa Contabilidade | `consulta@alfa.tribu.example` | `VIEWER` |
| Beta Contabilidade | `admin@beta.tribu.example` | `ADMIN` |
| Beta Contabilidade | `analista@beta.tribu.example` | `ANALYST` |
| Beta Contabilidade | `consulta@beta.tribu.example` | `VIEWER` |

Cada escritório tem também seis empresas fictícias. Os CNPJs têm raiz alfanumérica começada por `TRIBU` (ex.: `TRIBUA000001` + dígitos verificadores), para não coincidirem com empresas reais. Cinco delas têm perfil tributário: alguns completos e outros com dados ausentes (sem folha, sem faturamento, sem período), e uma empresa por escritório fica sem perfil.

A password só é aplicada quando a conta é **criada**. Mudar `SEED_PASSWORD` depois não altera contas existentes; para isso, recrie o banco.

## Variáveis de ambiente

Modelo em [`.env.example`](../.env.example). O backend valida o ambiente no arranque (Zod) e não arranca se algo estiver inválido.

| Variável | Usada por | Obrigatória | Descrição |
|---|---|---|---|
| `DATABASE_URL` | API, migrations, seed, testes e2e | sim | URL `postgresql://`; no Docker Compose é montada a partir das variáveis `POSTGRES_*` |
| `NODE_ENV` | API | não (`development`) | `development`, `test` ou `production`. Com `production`, a API e o seed recusam valores de exemplo (D19). O `docker compose` local usa `development` |
| `PORT` | API | não (`3000`) | Porta HTTP |
| `SEED_PASSWORD` | seed, testes e2e | para o seed | Password das contas fictícias, mínimo 8 caracteres |
| `SEED_ON_START` | container do backend | não (`false`) | `true` executa o seed a cada arranque |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | serviço `db` | sim | Credenciais do PostgreSQL local |

## Recriar o banco do zero

Com Docker (apaga o volume, aplica as migrations e executa o seed ao arrancar):

```bash
docker compose down -v
docker compose up --build
```

Só o banco, em desenvolvimento local:

```bash
cd backend
npm run db:reset       # prisma migrate reset (pede confirmação) + seed
```

## Testes

[`backend/test/database.e2e-spec.ts`](../backend/test/database.e2e-spec.ts) corre contra PostgreSQL real com as migrations aplicadas (`npm run test:e2e`). Verifica:

- as migrations aplicadas correspondem às do repositório;
- o enum, as restrições e os índices existem;
- unicidade de email e CNPJ, e as restrições `CHECK`;
- FK para escritório inexistente e bloqueio da remoção de um escritório com utilizadores;
- uma consulta filtrada por tenant não devolve dados de outro escritório;
- o seed é idempotente e guarda apenas hashes argon2id.

Os testes criam e removem os seus próprios escritórios; os dados do seed ficam.
