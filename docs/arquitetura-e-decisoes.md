# Relatório Técnico — Fase 1 (Análise e Arquitetura)

> Status: **aprovado** em 2026-09-26. Decisões D10–D14 aprovadas em 2026-09-27 (autenticação, semana 2). Decisões D15–D20 aprovadas em 2026-09-28 (auditoria de segurança, [seguranca.md](seguranca.md)). D21, aprovada em 2026-09-27 com o layout base, registada em 2026-09-28. D22 aprovada em 2026-10-02 (fecho da semana 2). D24 e D25 aprovadas em 2026-10-08 (revisão de fragilidades antes da semana 4, [seguranca.md](seguranca.md#estado-de-implementação)). D26–D30 aprovadas em 2026-10-09 (Tax Engine e Radar, semana 4). D31 aprovada em 2026-10-09 (análises). D32 e D33 aprovadas em 2026-10-09 (fontes do conteúdo tributário e elegibilidade ao Fator R). D34–D38 aprovadas em 2026-10-10 (importação, semana 5). D39 aprovada em 2026-10-10 (leitura de XLSX). D40–D43 aprovadas em 2026-10-10 (simulações, auditoria e histórico, semana 6). D44 aprovada em 2026-10-10 (endurecimento antes do deploy, semana 6).
> Fontes: [definicao-do-produto.md](definicao-do-produto.md), [instrucoes-fase-analise.md](instrucoes-fase-analise.md), [regras-academicas.md](regras-academicas.md), [CLAUDE.md](CLAUDE.md).

## 1. Estado inicial

- Repositório vazio (apenas `CLAUDE.md` e `REGRAS.md`, hoje `regras-academicas.md`), sem commits nem remote.
- Ambiente: Fedora 44, Node.js 22.23.1, npm 10.9.8, Git 2.55.0, OpenSSL 3.5.8.
- Docker/Compose ausentes (Podman 5.8.7 presente, sem provider de compose) → decisão D1.

## 2. Decisões

| # | Decisão | Resolução |
|---|---|---|
| D1 | Runtime de containers | Docker Engine + Compose plugin |
| D2 | Repositório | Monorepo; a raiz corresponde ao `product/` da especificação; branch principal `main` |
| D3 | Primeira regra tributária | Simples Nacional — Fator R (Anexo III × V) e alíquota efetiva |
| D4 | Papéis | `ADMIN`, `ANALYST`, `VIEWER` |
| D5 | Onboarding | Registo público cria `AccountingFirm` + primeiro `ADMIN` (exigência das [regras académicas](regras-academicas.md)) |
| D6 | Entidades | Criar `ImportBatch`; `AnalysisInput` vira `inputSnapshot` (JSONB) em `Analysis` |
| D7 | Sessão | JWT em cookie httpOnly, `SameSite=Strict`, ~8h, sem refresh token; logout invalida via `tokenVersion` |
| D8 | Deploy público | Origem única: o mesmo domínio serve o frontend e faz proxy de `/api` (exigido por D7). Fornecedor a decidir na semana 7 (candidatos: Render, Railway; D23) |
| D9 | Documentação | Especificações versionadas em `docs/` em Markdown |
| D10 | Autenticação (semana 2) | `@nestjs/jwt` com guard próprio, sem Passport; tenant e papel lidos da BD a cada pedido (JWT só com `sub` e `tv`) |
| D11 | Password | 8 a 128 caracteres, sem regras de composição (NIST 800-63B) |
| D12 | Registo | 409 para email já registado; o registo já inicia sessão |
| D13 | Papéis | Só `ADMIN` altera utilizadores; o escritório nunca fica sem `ADMIN`. Restantes permissões definidas com cada funcionalidade |
| D14 | Isolamento na semana 2 | `GET /users` e `PATCH /users/:id` servem de recurso para os testes A/B |
| D15 | Schema do tenant | Toda tabela do tenant, incluindo as filhas (`SimulationScenario`, `ExternalCompanyMapping`), tem `accounting_firm_id NOT NULL`; toda FK entre tabelas do tenant é composta; toda unicidade de negócio inclui o tenant |
| D16 | Verificação de tenant no Prisma | Client Extension que **recusa** (não completa) queries sobre tabelas do tenant sem `accountingFirmId` no nível superior do `where`/`data`; cliente `unscoped` só no módulo `auth` |
| D17 | Testes de isolamento obrigatórios | Matriz BOLA, inventário de rotas (`@Public()` e `:id`) e catálogo do schema passam a fazer parte da Definition of Done |
| D18 | Papéis do banco | Antes do deploy: papel da API sem superuser nem DDL; migrations com papel próprio |
| D19 | Ambiente de produção | Com `NODE_ENV=production`, a API não arranca com valores de exemplo (`change-me…`) nem com `COOKIE_SECURE=false` |
| D20 | Company e TaxProfile (semana 3) | Leitura para todos os papéis; criar/editar Company e TaxProfile para `ADMIN` e `ANALYST`; `VIEWER` só lê; sem `DELETE` no MVP. Campos do TaxProfile anuláveis para distinguir ausente de zero |
| D21 | Navegação por papel | Todas as secções aparecem para todos os papéis; cada secção recebe restrição quando a regra da sua funcionalidade for aprovada, protegida também na rota e na API (esconder no frontend é só conveniência, S24) |
| D22 | Criação de utilizadores | `POST /users` (o `ADMIN` acrescenta colegas ao escritório) sai da semana 2 e passa à lista de extras (US17). A forma de o colega receber o acesso (password temporária ou link por email) é decidida antes da implementação. Na semana 2, a gestão da equipa é editar nome e papel (US05) |
| D23 | Deploy só na semana 7 | O primeiro deploy público sai da semana 3 e fica para a semana 7, como no plano do professor, para evitar custos de hospedagem antes do fim do projeto. Com ele vão a escolha do fornecedor (D8) e os papéis do banco (D18). D19 e `helmet` ficam na semana 3, porque não dependem do fornecedor |
| D24 | Corpo dos pedidos só em JSON | A API responde 415 a um corpo que não seja `application/json`. Um formulário HTML de outro site (`x-www-form-urlencoded`, sem preflight de CORS) deixa de ser lido, o que junta uma defesa contra CSRF ao `SameSite=Strict` (D7). Pedidos sem corpo, como o logout, continuam aceites |
| D25 | Verificação de tenant cobre o escritório | A verificação da D16 passa a abranger o próprio `AccountingFirm`, que não tem `accountingFirmId` mas cujas relações levam a todos os dados do escritório. Pelo cliente com verificação, o escritório só é lido ou alterado pelo `id` no nível superior do `where`; criá-lo só no registo (módulo `auth`, cliente `unscoped`) |
| D26 | Radar calculado no pedido (resolve Q1) | O estado de cada empresa é calculado a cada pedido a `GET /radar`, pela mesma função pura do Tax Engine aplicada ao perfil atual, sem gravar nada. `Analysis.radarStatus` guarda só o estado no momento da execução, como histórico. Guardar o estado atual fica como endurecimento futuro, com o mesmo gatilho da fila de processamento ([seguranca.md](seguranca.md#endurecimento-futuro)) |
| D27 | Papéis nas análises | `ADMIN` e `ANALYST` executam análises; todos os papéis consultam o Radar e as análises; `VIEWER` recebe 403 ao executar (como na D20) |
| D28 | Regra `SIMPLES_FATOR_R@1` | Ver §3.4.1. Fator R = folha ÷ RBT12, ambos dos 12 meses anteriores ao período; com 28% ou mais, Anexo III, abaixo, Anexo V (LC 123/2006, art. 18, §§ 5º-J, 5º-K e 5º-M). Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 (art. 18, § 1º-A). A elegibilidade da atividade (CNAE) não é verificada: entra no trace como premissa (substituído pela D33). Só se aplica ao regime `SIMPLES_NACIONAL` |
| D29 | Classificação do Radar | Precedência e critérios na §3.5. Margem do limiar (3 p.p.) e idade máxima do período (12 meses) são parâmetros da versão da regra. O mês de referência no futuro passa a ser recusado com 400 no perfil tributário |
| D30 | Prioridade no Radar | `priorityScore` = peso do estado × 1000 + desempate. Pesos: `REQUER_ANALISE` 4, `OPORTUNIDADE_PARA_AVALIAR` 3, `REVISAR_REGRA` 2, `DADOS_INCOMPLETOS` 1, `NORMAL` 0. Desempate: ⌊999 × (1 − \|Fator R − 0,28\|)⌋ quando há Fator R, senão 0. Empate final pela razão social. A página da análise mostra código, versão, vigência e fonte da regra; a consulta de versões continua extra |
| D31 | Análises que não calculam | Fora do Simples Nacional, `POST /companies/:id/analyses` responde 422 e nada é gravado: a regra não se aplica. Com dados em falta, RBT12 zero ou acima do limite, ou sem versão vigente no mês, a análise é gravada como `INCOMPLETE`, com o motivo e o que faltou, para ficar registado que se tentou, com que dados e com que versão. Sem mês de referência ou sem versão vigente, a análise não tem versão nem checksum. A atividade não sujeita ao Fator R também responde 422 (D33) |
| D32 | Fonte oficial para todo o conteúdo tributário | Nenhum valor ou conceito tributário (alíquotas, limites, regimes, listas de atividades, prazos) entra no sistema sem norma e dispositivo, link para o texto oficial (Planalto, Diário Oficial, Receita Federal ou CGSN), data da conferência e quem conferiu. Uma regra tributária só é publicada depois da confirmação de uma segunda pessoa, idealmente um contador. Decisões de produto (margens, prazos, pesos) ficam marcadas como tal. Fontes e procedimento de atualização na §3.4.2 |
| D33 | Elegibilidade ao Fator R confirmada no perfil | O Fator R só se aplica às atividades dos §§ 5º-I e 5º-M do art. 18 da LC 123/2006. O perfil tributário ganha "atividade sujeita ao Fator R" (sim, não, não informado; não informado é dado ausente, D20), editado pelos papéis da D20. Sim: calcula. Não: o Radar mostra `NORMAL` (a regra não se aplica) e a análise responde 422 sem gravar. Não informado: o Radar mostra `DADOS_INCOMPLETOS` e a análise fica `INCOMPLETE`. A premissa passa a dado confirmado. Como muda a entrada do cálculo, entra como evaluator `SIMPLES_FATOR_R@2` numa versão 2 da regra (mesmos parâmetros, vigente desde 2018); a versão 1 passa a `SUPERSEDED`, e as empresas analisadas com ela aparecem com `REVISAR_REGRA`. Os perfis existentes ficam com o campo vazio até o contador confirmar. Implementada no início da semana 5 |
| D34 | Importação: papéis e conteúdo | `ADMIN` e `ANALYST` importam e confirmam (como na D20); `VIEWER` vê o histórico. Importa empresas e, opcionalmente, o perfil tributário, num modelo de ficheiro fixo (§3.6.1) com ficheiro de exemplo. Numa empresa existente, célula vazia não altera o valor atual; numa empresa nova, fica como dado ausente (D20) |
| D35 | Importação: limites e segurança | Ficheiro até 2 MB e 2.000 linhas de dados; XLSX até 20 MB descompactado, verificado antes de abrir, e só a primeira folha. Referências de linha acima de 10.000 e de coluna acima de 200 são recusadas (estruturas enormes em memória). Tipo pela extensão e pelos primeiros bytes. XML com `DOCTYPE` é recusado (expansão de entidades). Célula com fórmula é erro na linha; nenhuma fórmula é avaliada. CSV com `;` ou `,` e em UTF-8 ou Windows-1252. O ficheiro vai em base64 dentro de JSON: a S27 não ganha exceção, só o limite de tamanho do corpo sobe nesta rota. O ficheiro original não é guardado e o pedido nunca entra nos logs (S21). Rate limit na rota |
| D36 | Importação: deduplicação e conflitos | Por linha: `id_externo` já mapeado na origem → CNPJ no escritório → empresa nova. Resultados: nova, atualizada (só os campos preenchidos, com antes e depois), sem alterações, conflito (CNPJ repetido no ficheiro; `id_externo` e CNPJ que apontam para empresas diferentes) e erro (dados inválidos, com mensagem por campo). Conflitos e erros nunca são aplicados; resolvem-se corrigindo o ficheiro ou a ficha e importando de novo. Cada importação tem uma origem (`Integration` do tipo `FILE`, com nome); os `id_externo` ficam em `ExternalCompanyMapping`, nunca na empresa |
| D37 | Importação: prévia, confirmação e retenção | A prévia vale 24 horas; depois expira (`EXPIRED`). A confirmação revalida tudo numa transação: se a carteira mudou desde a prévia, responde 409 e pede uma prévia nova. Depois de confirmar, cancelar ou expirar, as linhas da prévia são apagadas e fica só o resumo (contagens, origem, quem e quando). Processamento síncrono; a fila só entra pelos gatilhos de [seguranca.md](seguranca.md#endurecimento-futuro) |
| D38 | Depois da importação | O Radar mostra as empresas importadas no pedido seguinte (D26). Nenhuma análise é executada automaticamente (a análise em lote continua extra). A auditoria das importações entra com o `AuditLog` (semana 6, S14) |
| D39 | Leitura de XLSX sem `exceljs` | Em vez do `exceljs` previsto na §3.2 (169 pacotes instalados, 2 vulnerabilidades moderadas, sem publicação desde 12/2024), o XLSX é lido com `fflate` (unzip) e `fast-xml-parser`, mais `csv-parse` e `iconv-lite` para o CSV: 12 pacotes e nenhuma vulnerabilidade no `npm audit` de 2026-10-10. O `fflate` dá o tamanho descompactado declarado de cada parte antes de a extrair, o que permite a verificação da D35; um ZIP que declara menos do que contém é cortado no tamanho declarado e recusado como corrompido. O leitor da primeira folha é próprio e testado com um XLSX gravado pelo LibreOffice em pt-BR |
| D40 | Simulações | Exigem o perfil que uma análise precisa para concluir (Simples Nacional, atividade sujeita ao Fator R, RBT12, folha e mês); senão 422 com o que falta. A "Situação atual" vem do perfil; o contador acrescenta até 5 cenários com nomes distintos, cada um a alterar só a receita e/ou a folha dos 12 meses. Cada cenário calcula Fator R, anexo e alíquota efetiva com o mesmo evaluator das análises, o imposto anual estimado (RBT12 × alíquota efetiva) e a diferença para a situação atual em reais e em pontos percentuais. A anualização é premissa de produto (a lei aplica a alíquota efetiva à receita de cada mês, art. 18, § 1º-A), sempre visível e marcada como estimativa (D32). A simulação é imutável e reproduzível (versão da regra, checksum, versão do motor, entradas) e nunca altera o perfil. `ADMIN` e `ANALYST` criam; todos consultam (como na D27) |
| D41 | Registo de auditoria | Eventos: registo do escritório, login, logout, utilizador alterado, empresa criada ou alterada, perfil tributário alterado, importação (prévia, confirmação, cancelamento), análise executada, simulação criada. Guarda quem, quando, a ação, a entidade e metadados com ids, nomes dos campos alterados e contagens, nunca valores fiscais (S22); a mudança de papel guarda o papel antigo e o novo. Gravado na mesma transação da ação. Só inserção: a API não altera nem apaga, e um trigger garante o mesmo no banco (apagar fica para a remoção do escritório). Uma importação confirmada é um só evento, com as contagens. Logins falhados ficam de fora (um email inexistente não tem escritório; o rate limit trava o abuso). O endereço IP não é guardado (dado pessoal sem uso definido). Retenção: enquanto o escritório existir, sem purga no MVP |
| D42 | Consulta da auditoria (corrige a §8) | `GET /audit-logs`, só `ADMIN` (403 para os outros), do mais recente para o mais antigo, com filtros por período, utilizador e tipo de evento. A página `/audit` é a primeira secção restringida por papel (D21): só `ADMIN` a vê no menu, e a rota e a API também a protegem. A US16 pede que o sócio veja o registo, por isso a consulta mínima (lista e filtros) passa da lista de extras da §8 para a semana 6; exportação, detalhe completo de cada evento e pesquisa livre continuam extra |
| D43 | Histórico (US15) | Cumprido pelas análises (lista na ficha, mais recente primeiro, resultado original preservado depois de uma versão nova da regra). A ficha da empresa passa a listar também as simulações, com link para cada uma |
| D44 | Endurecimento antes do deploy | Resultado da revisão de segurança de 2026-10-10. Como a D19 e o `helmet`, o que não depende do fornecedor (D23) entra antes da semana 7: (1) o Swagger (`/api/docs`) fica desligado com `NODE_ENV=production`, salvo `SWAGGER_ENABLED=true`; em desenvolvimento e testes continua ligado. (2) Rate limit em todas as rotas: 300 pedidos por minuto por IP em cada rota; o login, o registo e a prévia da importação mantêm 10 por minuto. O limite é verificado antes da sessão, para que um pedido em excesso não chegue ao banco. (3) Vulnerabilidades do `npm audit` corrigidas com `overrides` na mesma major (`mysql2` dentro do `prisma`, `js-yaml` dentro do `@nestjs/swagger`); o `npm audit fix --force` não é usado, porque instalaria o Prisma 6. O `deepmerge-ts` do `@prisma/config` só tem correção numa major nova e no Prisma em versão `dev`: fica até haver uma versão estável, porque só junta a configuração do `prisma.config.ts`, que é do projeto |
| — | Banco | PostgreSQL + Prisma ([ADR 0001](adr/0001-postgresql-prisma.md)) |
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
- Dependências: `@nestjs/config` + `zod`, `class-validator`, `@nestjs/swagger`, `@nestjs/jwt` (sem `passport-jwt`, D10), `argon2`, `@nestjs/throttler`, `helmet`, `cookie-parser`, `nestjs-pino`, `csv-parse`, `iconv-lite`, `fflate` e `fast-xml-parser` (leitura de CSV e XLSX, D39), `decimal.js` (aritmética do Tax Engine), `supertest` (dev).

### 3.3 Multi-tenancy

Schema compartilhado com `accountingFirmId` em toda entidade do tenant, incluindo as tabelas filhas (D15). Isolamento em 4 camadas:

1. `tenantId` vem **apenas** da sessão autenticada (`@CurrentTenant()`, tipo `TenantId`), nunca do request. O guard identifica o utilizador pelo JWT e lê o tenant na BD (D10).
2. Todo acesso filtra por `{ id, accountingFirmId }`; recurso de outro tenant → **404**. Uma Client Extension do Prisma recusa queries sobre tabelas do tenant sem esse filtro (D16).
3. FKs compostas `(companyId, accountingFirmId)` → `Company(id, accountingFirmId)` impedem referências cruzadas no próprio banco.
4. Testes e2e com dois escritórios para cada recurso, mais inventário de rotas e catálogo do schema que obrigam cada rota e tabela nova a ter essa cobertura (D17). O estado de cada mecanismo está em [seguranca.md](seguranca.md#estado-de-implementação).

RLS do PostgreSQL fica como endurecimento futuro, com gatilhos definidos em [seguranca.md](seguranca.md#endurecimento-futuro).

### 3.4 Tax Engine (reprodutibilidade)

- `TaxRule` (catálogo global) → `TaxRuleVersion` (`version`, `validFrom`, `validUntil`, `parameters` JSONB, `source`, `evaluatorKey`, `status`, `checksum`).
- Lógica em evaluators TypeScript puros registrados por chave (ex.: `SIMPLES_FATOR_R@1`); parâmetros em dados. Sem DSL.
- Versões publicadas e evaluators publicados são imutáveis; mudanças geram nova versão/chave.
- Seleção pela versão `PUBLISHED` vigente no período; constraint `EXCLUDE` impede sobreposição; sem versão vigente → `REVISAR_REGRA`.
- `Analysis` é imutável e grava snapshot de entrada, versão da regra, checksum dos parâmetros, versão do engine, resultado, trace, ausências, premissas, executor e data.
- Teste de replay garante resultado idêntico. Dados ausentes → `INCOMPLETE`; nada é inventado. Nenhum LLM participa.

Implementação (semana 4):

- Evaluator `SIMPLES_FATOR_R@1`, registo por chave e escolha da versão vigente em [`tax-calculations/`](../backend/src/tax-calculations/); classificador do Radar em [`radar-classifier.ts`](../backend/src/radar/radar-classifier.ts). Funções puras: o mês atual entra como parâmetro.
- Aritmética com `decimal.js` (40 dígitos, arredondamento metade para cima). O Fator R guarda a precisão completa; a alíquota efetiva tem 4 casas (0,1303 = 13,03%). Os textos da explicação truncam o Fator R, para um valor abaixo do limiar nunca aparecer igual a ele.
- Resultados do evaluator: `COMPLETED`; `INCOMPLETE` (lista o que falta); `NOT_COMPUTABLE` (RBT12 zero ou acima do limite); `NOT_APPLICABLE` (fora do Simples Nacional). Cada um traz o trace e as premissas.
- `ENGINE_VERSION` (hoje `1.1.0`) é gravado em cada análise e muda quando um evaluator muda resultados.
- `SIMPLES_FATOR_R@2` (D33), na versão 2 da regra: envolve o `@1` sem o alterar, recusa a atividade não sujeita ao Fator R (`NOT_APPLICABLE`), exige a confirmação da elegibilidade (`INCOMPLETE` sem ela) e troca a premissa por um passo confirmado. O `@1` continua registado para reproduzir as análises feitas com a versão 1.

#### 3.4.1 Parâmetros da versão 1 (D28)

Vigência a partir de 2018-01-01, sem fim. Valores conferidos em 2026-10-09 no [texto compilado da LC 123/2006](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm) (Anexos III e V, redação da LC 155/2016).

| Faixa | RBT12 (R$) | Anexo III: alíquota / parcela a deduzir | Anexo V: alíquota / parcela a deduzir |
|---|---|---|---|
| 1 | até 180.000,00 | 6,00% / 0 | 15,50% / 0 |
| 2 | 180.000,01 a 360.000,00 | 11,20% / 9.360,00 | 18,00% / 4.500,00 |
| 3 | 360.000,01 a 720.000,00 | 13,50% / 17.640,00 | 19,50% / 9.900,00 |
| 4 | 720.000,01 a 1.800.000,00 | 16,00% / 35.640,00 | 20,50% / 17.100,00 |
| 5 | 1.800.000,01 a 3.600.000,00 | 21,00% / 125.640,00 | 23,00% / 62.100,00 |
| 6 | 3.600.000,01 a 4.800.000,00 | 33,00% / 648.000,00 | 30,50% / 540.000,00 |

Os cálculos usam aritmética decimal, nunca vírgula flutuante. A LC 214/2025 (reforma tributária) altera a LC 123 com efeitos futuros; quando a tabela mudar, publica-se uma versão nova, e as análises antigas continuam a apontar para a versão 1.

#### 3.4.2 Fontes e atualização (D32)

| Conteúdo | Fonte oficial | Conferido |
|---|---|---|
| Fator R: limiar de 28%, folha e RBT12 dos 12 meses anteriores, fórmula da alíquota efetiva | [LC 123/2006](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm), art. 18, §§ 1º-A, 5º-J, 5º-K e 5º-M | 2026-10-09 |
| Tabelas dos Anexos III e V (§3.4.1) | LC 123/2006, Anexos III e V, redação da LC 155/2016, vigência 01/01/2018 | 2026-10-09 |
| Atividades sujeitas ao Fator R (D33) | LC 123/2006, art. 18, §§ 5º-I e 5º-M | 2026-10-09 (existência dos parágrafos; a lista de CNAEs não foi importada) |
| Limite de receita do Simples Nacional (R$ 4.800.000,00) | LC 123/2006, art. 3º, II | 2026-10-09 |
| Regimes do perfil: Simples Nacional | LC 123/2006 | 2026-10-09 |
| Regimes do perfil: Lucro Presumido (opção até R$ 78.000.000,00 no ano anterior) e Lucro Real (obrigatoriedade) | [Lei 9.718/1998](https://www.planalto.gov.br/ccivil_03/leis/l9718compilada.htm), arts. 13 e 14 | 2026-10-09 |
| MEI fora do MVP | Decisão de âmbito, sem base legal | — |
| Margem de oportunidade (3 p.p.), idade máxima dos dados (12 meses), pesos da prioridade | Decisões de produto (D29, D30) | — |

As conferências de 2026-10-09 foram feitas pelo agente de desenvolvimento, com o texto compilado do Planalto, e ainda aguardam a confirmação de uma segunda pessoa (D32).

**Procedimento de atualização** (todos os meses e antes de cada entrega):

1. Ver o texto compilado da LC 123/2006 no Planalto (as notas "Vide" junto aos anexos e aos artigos assinalam alterações, como a da LC 214/2025, com efeitos futuros) e as resoluções do CGSN.
2. Se uma fonte da tabela acima mudou: criar a versão nova da regra por migration, com a vigência da norma, os parâmetros e a base legal; uma lógica nova é um evaluator novo.
3. Testar contra a tabela nova e contra casos de referência externos (exemplos oficiais ou calculados por um contador).
4. Obter a confirmação de uma segunda pessoa, registada no PR.
5. Publicar e fechar a vigência da versão anterior. O Radar passa a mostrar `REVISAR_REGRA` nas empresas analisadas com ela.
6. Atualizar esta tabela com a data da conferência.

A monitorização automática das fontes (comparar o hash das secções relevantes e abrir um alerta quando mudam) fica como extra; avisa, nunca publica.

### 3.5 Tax Radar

Classificação derivada (não é entidade), calculada a cada pedido (D26) por uma função pura, com precedência fixa (D29):

1. `DADOS_INCOMPLETOS` — sem perfil, sem regime, ou, no Simples Nacional, falta RBT12, folha, mês de referência ou a confirmação de que a atividade está sujeita ao Fator R (D33).
2. `REVISAR_REGRA` — nenhuma versão publicada vigente no mês de referência, ou a última análise da empresa usou uma versão que já não é a vigente.
3. `REQUER_ANALISE` — RBT12 acima de R$ 4.800.000,00 (limite do regime), RBT12 igual a zero (sem base de cálculo), folha maior que o RBT12 (dados inconsistentes), ou mês de referência com mais de 12 meses (dados desatualizados).
4. `OPORTUNIDADE_PARA_AVALIAR` — Fator R a menos de 3 p.p. do limiar de 28%, de qualquer um dos lados (perto de mudar de anexo).
5. `NORMAL` — os restantes casos, incluindo empresas fora do Simples Nacional ou com atividade não sujeita ao Fator R, em que a regra não se aplica (o motivo diz isso).

Cada sinal traz `reasons[]` (`code`, `message`, regra, versão, dados usados, ausências, premissas) e um `priorityScore` determinístico (D30). Limiares são parâmetros da versão da regra.

### 3.6 Integrações

`Fonte → Parser → Normalização → Validação → Deduplicação → Mapeamento → Prévia → Confirmação → Domínio`.

- `CompanySourceAdapter` com `CsvAdapter` e `XlsxAdapter`; conectores futuros implementam a mesma interface.
- CNPJ validado (numérico e alfanumérico — IN RFB 2.229/2024).
- Deduplicação: mapeamento externo → CNPJ no tenant → novo; duplicidades/contradições → conflito (nunca aplicado automaticamente).
- `ImportBatch` guarda prévia e resumo; confirmação transacional; limites de tamanho e linhas.
- Leitura do ficheiro (semana 5): funções puras em [`imports/reading/`](../backend/src/imports/reading/) — limites e formato pelo conteúdo, CSV (UTF-8 ou Windows-1252, `;` ou `,`), primeira folha do XLSX (texto partilhado, inline e rico, números, booleanos, datas em número de série nos sistemas 1900 e 1904), cabeçalho e linhas normalizadas com os erros por coluna. Recupera os zeros à esquerda que o Excel apaga no CNPJ e no CNAE (os dígitos verificadores confirmam o CNPJ).
- Prévia e confirmação (semana 5): a classificação de cada linha (nova, atualizada, sem alterações, conflito, erro) é uma função pura em [`import-preview.ts`](../backend/src/imports/import-preview.ts). A confirmação volta a classificar todas as linhas numa transação `SERIALIZABLE` e compara com a prévia guardada; se diferem, ou se o PostgreSQL deteta uma alteração concorrente, responde 409 e nada é aplicado. Prévias com mais de 24 horas passam a `EXPIRED` quando a lista ou a importação são lidas.
- Decisões da semana 5: papéis e conteúdo (D34), limites e segurança (D35), deduplicação e conflitos (D36), prévia e retenção (D37), efeitos (D38).

#### 3.6.1 Modelo do ficheiro (D34)

Uma linha de cabeçalho com estes nomes (sem distinguir maiúsculas nem acentos) e uma empresa por linha. Colunas desconhecidas são ignoradas e listadas na prévia.

| Coluna | Obrigatória | Formato aceite |
|---|---|---|
| `cnpj` | sim | numérico ou alfanumérico, com ou sem máscara |
| `razao_social` | sim | texto |
| `nome_fantasia` | não | texto |
| `id_externo` | não | código da empresa no sistema de origem |
| `regime` | não | Simples Nacional, Lucro Presumido ou Lucro Real |
| `cnae`, `municipio`, `uf` | não | como no perfil tributário |
| `receita_12m`, `folha_12m` | não | `1.200.000,00` ou `1200000.00` |
| `mes_referencia` | não | `2026-09` ou `09/2026` |
| `sujeita_fator_r` | não | sim, não ou vazio (D33) |

As validações são as da API (CNPJ, valores não negativos, mês nunca no futuro, D29).

## 4. Modelo de dados

| Entidade | Chaves / constraints principais |
|---|---|
| AccountingFirm | `cnpj` único (opcional) |
| User | `email` único (minúsculas); único `(id, accountingFirmId)`; índice `accountingFirmId`; `role`, `tokenVersion` |
| Company | únicos `(accountingFirmId, cnpj)` e `(id, accountingFirmId)`; índice `(accountingFirmId, legalName)` |
| TaxProfile | 1:1 com Company (único `(companyId, accountingFirmId)`); FK composta; CHECK valores ≥ 0; campos anuláveis (D20) |
| TaxRule | `code` único |
| TaxRuleVersion | único `(taxRuleId, version)`; CHECK `validUntil > validFrom`; EXCLUDE sobreposição |
| Analysis | FKs compostas → Company e User; índice `(accountingFirmId, companyId, executedAt DESC)`; versão da regra e checksum anuláveis só em `INCOMPLETE` (D31); imutável (trigger) |
| Simulation | FKs compostas → Company e User; FK → TaxRuleVersion; único `(id, accountingFirmId)`; 1:N SimulationScenario; entradas, checksum e versão do motor; imutável (D40) |
| SimulationScenario | `accountingFirmId`; FK composta → Simulation; único `(simulationId, label)` |
| AuditLog | só inserção (trigger, D41); FK composta → User; índice `(accountingFirmId, createdAt DESC)`; metadados sem valores fiscais (S22) |
| Integration | tipo `FILE` (D36); únicos `(accountingFirmId, type, name)` e `(id, accountingFirmId)` |
| ExternalCompanyMapping | `accountingFirmId`; FKs compostas → Integration e Company; únicos `(integrationId, externalId)`, `(integrationId, companyId)` |
| ImportBatch | FKs compostas → Integration e User; índice `(accountingFirmId, createdAt DESC)`; estados `PREVIEW`, `CONFIRMED`, `CANCELLED`, `EXPIRED`; linhas da prévia apagadas ao sair de `PREVIEW` (D37) |

Regras de schema do tenant (D15): toda tabela do tenant tem `accounting_firm_id NOT NULL` e índice que começa por ela; tabelas que podem ser pai têm único `(id, accountingFirmId)`; FKs entre tabelas do tenant são compostas; unicidades de negócio incluem o tenant. `TaxRule` e `TaxRuleVersion` são globais e só mudam por migration/seed. Valores monetários em `Decimal(15,2)`. IDs UUID. Migrations via Prisma Migrate (SQL adicional para CHECK/EXCLUDE). Seed idempotente e fictício: 2 escritórios, um usuário por papel, ~30 empresas cobrindo todos os estados do Radar, primeira regra publicada (por migration, para existir também em produção); senhas de demonstração via variáveis de ambiente.

## 5. API (`/api/v1`, Swagger em `/api/docs`)

| Módulo | Endpoints |
|---|---|
| auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| accounting-firms | `GET`, `PATCH /accounting-firm` |
| users | `GET /users`, `PATCH /users/:id`; `POST /users` é extra (D22) |
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

React Router, TanStack Query (entra com o primeiro módulo de negócio), `AuthContext`, CSS Modules, layout **responsivo mobile-first** (Radar em cartões no telemóvel). Testes com Vitest, Testing Library e MSW.

Rotas: `/login`, `/register`, `/radar` (inicial), `/companies`, `/companies/new`, `/companies/:id`, `/analyses/:id`, `/companies/:id/simulations/new`, `/simulations/:id`, `/imports`, `/imports/new`, `/imports/:id`, `/settings/*`, `/audit`.

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
| 3 | Verificação de tenant no Prisma e testes de isolamento (D16, D17) antes de Company; Company + TaxProfile ponta a ponta; D19 e `helmet` |
| 4 | **Checkpoint 2** — Tax Engine, Analysis, Radar com explicação |
| 5 | Importação CSV/XLSX com prévia e confirmação |
| 6 | Simulações, histórico, auditoria — **feature freeze** |
| 7 | Testes, CI verde, escolha do fornecedor (D8), papéis do banco (D18) e deploy público (D23), acessibilidade, revisão de segurança |
| 8 | Bugfix, README com screenshots, vídeo de 3 min, demo |

Se houver tempo: resolução de conflitos da importação linha a linha (D36), análise da carteira em lote, exportação, detalhe completo e pesquisa livre na auditoria (a consulta mínima entrou na semana 6, D42), criação de utilizadores pelo `ADMIN` (D22, US17), consulta de versões de regras, monitorização automática das fontes legais (D32).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Conteúdo tributário incorreto | Parâmetros e fonte legal versionados; toda fonte citada e conferida, com confirmação de uma segunda pessoa (D32); elegibilidade confirmada pelo contador (D33); resultados como suporte à decisão |
| Mudanças legais (Reforma Tributária) | Versionamento com validade temporal |
| Falsa precisão | Premissas e ausências sempre visíveis; simulações rotuladas como estimativa |
| Vazamento entre tenants | Defesa em 4 camadas + testes e2e |
| Prazo de 8 semanas | Escopo priorizado; o que não depende do fornecedor (D19, `helmet`) é feito antes da semana 7 (D23) |
| Upload malicioso | Limites de tamanho/linhas, parsers seguros |

## 10. Questões em aberto

Pontos em que os documentos ainda não têm uma resposta única. Cada um é resolvido por uma decisão (Dxx) antes do prazo indicado.

| # | Questão | Prazo |
|---|---|---|
| ~~Q1~~ | **Resolvida pela D26 (2026-10-09): calculado no pedido.** ~~Estado do Radar: calculado ou guardado.~~ A §3.5 define o estado como derivado (função pura), mas a §4 e o [modelo de dados](modelo-dados.md) guardam `Analysis.radarStatus`, com índice para filtrar. Um estado guardado fica desatualizado quando a versão da regra é substituída (`REVISAR_REGRA`) ou o perfil muda, e empresas sem análise (`DADOS_INCOMPLETOS`) não têm onde o guardar. Falta decidir se o Radar é sempre calculado no pedido (e `radarStatus` é só o histórico da execução) ou se existe um estado atual guardado e recalculado | Antes da migration de `analyses` (semana 4) |
