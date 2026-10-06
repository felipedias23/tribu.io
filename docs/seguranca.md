# Padrão de desenvolvimento seguro

Regras obrigatórias para toda funcionalidade nova do Tribu.io. Resultam da auditoria técnica e de segurança de 2026-09-28 e das decisões D15–D20 ([relatório §2](arquitetura-e-decisoes.md#2-decisões)).

O requisito que orienta todas elas: **um escritório nunca acede, altera nem descobre dados de outro**. O isolamento não depende do frontend; é garantido no backend e no banco.

## Como o isolamento funciona

```text
sessão ─► @CurrentTenant() ─► service(tenantId: TenantId, …)
      ─► Prisma com verificação de tenant (falha se a query não filtra) ─► PostgreSQL
                                                                           └─ FKs compostas impedem relações entre tenants
testes ─► matriz BOLA (A → B = 404) · inventário de rotas · catálogo do schema
```

| Camada | O que garante | O que não garante |
|---|---|---|
| `TenantId` vindo da sessão | O tenant nunca vem do pedido | Que a query o use |
| Verificação de tenant no Prisma (D16) | Toda query sobre tabela do tenant filtra por `accountingFirmId` | Que o valor seja o certo (isso é o `TenantId`); `$queryRaw` |
| FKs compostas (D15) | Um registo do tenant A nunca aponta para um do tenant B | Leituras sem filtro |
| Testes (D17) | Cada rota e cada tabela nova prova o isolamento | — |

RLS do PostgreSQL não é usado no MVP. Ver [quando adotar](#endurecimento-futuro).

## Estado de implementação

As regras valem para todo código novo. Os mecanismos que as verificam automaticamente entram por etapas:

| Mecanismo | Estado |
|---|---|
| `TenantId` vindo da sessão (`@CurrentTenant()`), 404 para outro escritório, testes e2e A/B em `/users` | Implementado (semana 2) |
| Rate limit no login e registo, `ValidationPipe` com `forbidNonWhitelisted`, testes de sessão e de papéis | Implementado (semana 2) |
| Verificação de tenant no Prisma (D16) | Implementado (semana 3): [`tenant-scope.ts`](../backend/src/prisma/tenant-scope.ts); import do cliente `unscoped` fora de `auth` bloqueado pelo ESLint (S5) |
| Matriz BOLA, inventário de rotas e catálogo do schema (D17) | Implementado (semana 3): [`bola-matrix.ts`](../backend/test/support/bola-matrix.ts), [`route-inventory.e2e-spec.ts`](../backend/test/route-inventory.e2e-spec.ts), [`schema-catalog.e2e-spec.ts`](../backend/test/schema-catalog.e2e-spec.ts) |
| FKs compostas (D15) | Implementado (semana 3): `tax_profiles` → `companies`; cada tabela nova é verificada pelo catálogo do schema |
| Arranque recusado em produção com valores de exemplo (D19, S25) | Pendente: semana 3 (D23) |
| Papel do banco sem superuser nem DDL (D18, S26) | Pendente: com o deploy público (semana 7, D23) |
| `helmet` | Pendente: semana 3 (D23; [autenticacao.md](autenticacao.md#deploy)) |

Enquanto um mecanismo está pendente, a regra correspondente é verificada na revisão do PR.

## Regras

### Tenant

- **S1.** O tenant vem só de `@CurrentTenant()`. Nenhum DTO, query ou rota contém `accountingFirmId` ou `tenantId`. `as TenantId` é proibido fora do `SessionService`.
- **S2.** Todo método de service que toca dados do tenant recebe `tenantId: TenantId` como primeiro parâmetro e usa-o em **todo** `where` e `data`, incluindo `update`, `delete`, `count`, `aggregate`, `groupBy` e as operações `*Many`. O filtro fica no nível superior do `where`, nunca dentro de `OR`.
- **S3.** Recurso de outro escritório responde **404**, com a mesma mensagem de um ID inexistente. Nunca 403 nem mensagem diferente.
- **S4.** Rotas aninhadas (`/companies/:id/…`) verificam o pai com `CompaniesService.findOwnedOrThrow(tenantId, companyId)` e filtram também os filhos por tenant.
- **S5.** Consultas sem tenant (cliente `unscoped`) só existem no módulo `auth` (login por email, sessão por id), cada uma com comentário a justificar.
- **S6.** `$queryRaw` sobre tabela do tenant inclui `accounting_firm_id = ${tenantId}` e tem teste e2e próprio. `$queryRawUnsafe` e `$executeRawUnsafe` são proibidos.

### Schema (D15)

- **S7.** Toda tabela do tenant, incluindo tabelas filhas, tem `accounting_firm_id uuid NOT NULL`, um índice que começa por essa coluna e, se puder ser pai, `UNIQUE (id, accounting_firm_id)`.
- **S8.** Toda FK entre tabelas do tenant é composta: `(x_id, accounting_firm_id) → x(id, accounting_firm_id)`.
- **S9.** Toda unicidade de negócio dentro do tenant inclui `accounting_firm_id` (ex.: `UNIQUE (accounting_firm_id, cnpj)`). Uma unicidade global responderia 409 e revelaria dados de outro escritório. Exceções aprovadas: `users.email` é único em todo o sistema, porque o login recebe só email e password ([banco-de-dados.md](banco-de-dados.md#decisões-de-modelagem), D12), e `accounting_firms.cnpj` é único porque identifica o próprio tenant. Nesses casos o 409 é aceite, e toda rota que o possa devolver tem rate limit contra enumeração.
- **S10.** `ON DELETE RESTRICT` por padrão. `CASCADE` só em filho que não existe sem o pai, com justificativa na migration.
- **S11.** Tabelas globais (`tax_rules`, `tax_rule_versions`) não têm endpoint de escrita. Mudam só por migration ou seed. O `ADMIN` de um escritório não é administrador da plataforma.

### Endpoints e papéis

- **S12.** Toda rota exige sessão. Um `@Public()` novo obriga a atualizar a allowlist do teste de inventário de rotas.
- **S13.** Toda rota de escrita autenticada (sem `@Public()`) declara `@Roles(...)`, mesmo que liste todos os papéis. A matriz de papéis de cada funcionalidade é aprovada antes da implementação.
- **S14.** Endpoints administrativos são `@Roles(Role.ADMIN)`, têm teste 403 para `ANALYST` e `VIEWER` e são auditados quando o `AuditLog` existir.
- **S15.** O service mapeia os campos do DTO um a um; nunca `data: dto`. Listagens são paginadas com `limit` máximo (100) e ordenação por lista fechada de campos.
- **S16.** Respostas usam `select` explícito; nunca devolvem o registo inteiro do Prisma.

### Uploads, jobs e integrações

- **S17.** Todo upload: limite de bytes (nginx e API), de linhas e de tamanho descompactado (XLSX é ZIP); tipo validado por extensão e *magic bytes*, não pelo `Content-Type`; leitura em streaming; fórmulas nunca avaliadas; o ficheiro original não é gravado; a prévia tem prazo de retenção.
- **S18.** Todo job assíncrono leva `tenantId` e `actorId` no payload, revalida o recurso no tenant ao executar e é idempotente.
- **S19.** Credenciais de integração são cifradas em repouso e nunca voltam pela API. Webhooks de entrada exigem assinatura HMAC com timestamp.
- **S20.** Exportações para CSV/XLSX escapam células que começam com `=`, `+`, `-`, `@`, tab ou CR (formula injection).

### Dados sensíveis e logs

- **S21.** Nunca registar em log password, cookie, JWT, cabeçalho `Authorization` nem o corpo de pedidos de importação ou de perfil tributário. Erros 5xx registam o código do erro, não os valores.
- **S22.** Todo dado sensível novo tem finalidade descrita, papéis que o podem ler, prazo de retenção e decisão sobre auditoria. O `AuditLog` guarda ids e nomes de campos alterados, não os valores fiscais.
- **S23.** Seeds e testes usam só dados fictícios: emails em `.example`, nomes claramente inventados.

### Frontend

- **S24.** `dangerouslySetInnerHTML` é proibido, e dados do tenant não vão para `localStorage` nem `sessionStorage`. A cache de pedidos é limpa no logout e quando a sessão expira. Esconder elementos por papel é só conveniência: quem autoriza é o backend.

### Produção (D18, D19)

- **S25.** Com `NODE_ENV=production`, a API não arranca com valores de exemplo (`change-me…`) em `JWT_SECRET`, `SEED_PASSWORD` ou credenciais do banco, nem com `COOKIE_SECURE=false`.
- **S26.** A API liga-se ao banco com um papel sem superuser e sem DDL. As migrations usam um papel próprio, dono das tabelas.

## Testes obrigatórios (D17)

Fazem parte da [Definition of Done](CLAUDE.md#5-definition-of-done-dod).

| Teste | Tipo | Falha quando |
|---|---|---|
| Matriz BOLA | e2e | Um pedido do escritório A a um `:id` do B (GET, PATCH, PUT, DELETE) não responde 404 igual ao de um ID inexistente, ou altera dados do B |
| Inventário de rotas | e2e | Surge um `@Public()` fora da allowlist ou uma rota com `:id` sem linha na matriz BOLA |
| Catálogo do schema | e2e | Uma tabela do tenant não tem `accounting_firm_id NOT NULL`, ou uma FK entre tabelas do tenant não é composta |
| Verificação de tenant no Prisma | unit | Uma query sobre tabela do tenant sem `accountingFirmId` (ou só dentro de `OR`), ou um `create` sem tenant, não é recusada |
| Papéis | e2e | Um papel sem permissão não recebe 403 numa rota de escrita ou administrativa |
| Oráculo de unicidade | e2e | Criar num escritório um registo com a mesma chave de negócio de outro escritório (ex.: CNPJ de uma empresa) não é aceite. Não se aplica às exceções da S9 |
| Campos proibidos | e2e | `accountingFirmId`, `role`, `tokenVersion` ou IDs de outro recurso no corpo não são rejeitados com 400 |
| Sessão | e2e | Token expirado, adulterado, de utilizador removido ou anterior ao logout não recebe 401 |
| Ambiente de produção | unit | Valores de exemplo ou `COOKIE_SECURE=false` são aceites com `NODE_ENV=production` |

## Endurecimento futuro

Adotado só quando um destes gatilhos acontecer:

| Medida | Gatilho |
|---|---|
| RLS do PostgreSQL | Mais de um programador a escrever queries; mais de 5 `$queryRaw` sobre tabelas do tenant; workers ou integrações com acesso direto ao banco; clientes reais com exigência contratual; um incidente de filtro ausente. As regras S7, S8 e S26 mantêm o custo baixo (cerca de 2 a 4 dias) |
| Fila de processamento (primeiro em PostgreSQL, depois Redis/BullMQ) | p95 de um endpoint acima de 5 s ou operação acima de 15 s; importações acima de 10 mil linhas ou 10 MB; lotes acima de 2.000 empresas; necessidade de retry, agendamento ou webhooks; mais de uma instância da API |
| Rate limit com armazenamento partilhado | Mais de uma instância da API |
| Gestor de secrets e rotação do `JWT_SECRET` | Clientes reais em produção |
