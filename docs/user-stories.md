# User stories do MVP

Backlog do Tribu.io para o quadro do Trello (colunas Backlog · Sprint · Em curso · Em revisão · Feito). Cada história corresponde a um cartão; os critérios de aceitação vão para a checklist do cartão. A coluna **Sem.** indica a semana prevista no [cronograma](relatorio-fase1.md#8-cronograma-8-semanas-semana-0--2026-09-26).

Personas ([definição do produto §3](product-definition.md#3-público-alvo)):

- **Sócio** — responsável pelo escritório; papel `ADMIN`.
- **Contador** — analisa a carteira de empresas; papel `ANALYST`.
- **Consulta** — acompanha sem alterar dados; papel `VIEWER`.

## Resumo

| ID | História | Épico | Sem. |
|---|---|---|---|
| US01 | Registar o escritório | Autenticação | 2 |
| US02 | Entrar no sistema | Autenticação | 2 |
| US03 | Sair do sistema | Autenticação | 2 |
| US04 | Isolamento entre escritórios | Multi-tenancy | 2 |
| US05 | Gerir utilizadores e papéis | Multi-tenancy | 2 |
| US06 | Cadastrar e editar empresas | Empresas | 3 |
| US07 | Listar e pesquisar empresas | Empresas | 3 |
| US08 | Preencher o perfil tributário | Empresas | 3 |
| US09 | Executar análise do Fator R | Tax Engine | 4 |
| US10 | Ver o Tax Radar da carteira | Tax Radar | 4 |
| US11 | Entender o porquê de um sinal | Tax Radar | 4 |
| US12 | Importar empresas por CSV/XLSX | Importação | 5 |
| US13 | Resolver conflitos da importação | Importação | 5 |
| US14 | Simular cenários | Simulação | 6 |
| US15 | Consultar o histórico de análises | Histórico | 6 |
| US16 | Consultar o registo de auditoria | Auditoria | 6 |

## Autenticação

### US01 — Registar o escritório

**Como** sócio de um escritório de contabilidade, **quero** criar uma conta para o meu escritório **para** começar a usar o Tribu.io.

- [ ] O registo cria o escritório e o primeiro utilizador com papel `ADMIN`.
- [ ] A password tem 8 a 128 caracteres e é guardada apenas em hash (argon2id) — decisão D11.
- [ ] Dados inválidos devolvem erro claro por campo; email já registado devolve 409 — decisão D12.
- [ ] Após o registo, o utilizador fica autenticado — decisão D12.

### US02 — Entrar no sistema

**Como** utilizador, **quero** entrar com email e password **para** aceder aos dados do meu escritório.

- [ ] Credenciais válidas criam sessão em cookie httpOnly, `SameSite=Strict`, com validade de ~8h.
- [ ] Credenciais inválidas mostram uma mensagem genérica (não revela se o email existe).
- [ ] Tentativas repetidas são limitadas (rate limit).
- [ ] Rotas protegidas do front-end redirecionam para `/login` sem sessão.

### US03 — Sair do sistema

**Como** utilizador, **quero** terminar a sessão **para** que ninguém use a minha conta neste dispositivo.

- [ ] O logout apaga o cookie e invalida o token (via `tokenVersion`).
- [ ] Um token antigo deixa de ser aceite após o logout.

## Multi-tenancy

### US04 — Isolamento entre escritórios

**Como** sócio, **quero** ter a garantia de que outro escritório nunca vê os meus dados **para** cumprir o sigilo profissional e a LGPD.

- [ ] O escritório é obtido apenas do token, nunca de parâmetros do pedido.
- [ ] Aceder a um recurso de outro escritório devolve 404.
- [ ] Testes e2e com dois escritórios cobrem cada recurso.

### US05 — Gerir utilizadores e papéis

**Como** sócio, **quero** convidar colegas e definir o que cada um pode fazer **para** controlar o acesso aos dados.

- [ ] Só `ADMIN` altera utilizadores (nome e papel) — decisão D13.
- [ ] O escritório nunca fica sem `ADMIN`.
- [ ] Ações proibidas pelo papel devolvem 403.
- [ ] As permissões de `ANALYST` e `VIEWER` em cada funcionalidade são definidas com essa funcionalidade.

## Empresas

### US06 — Cadastrar e editar empresas

**Como** contador, **quero** cadastrar uma empresa cliente **para** acompanhá-la no Tribu.io.

- [ ] CNPJ validado (numérico e alfanumérico, IN RFB 2.229/2024).
- [ ] CNPJ não se repete dentro do mesmo escritório.
- [ ] Alterações ficam no registo de auditoria.

### US07 — Listar e pesquisar empresas

**Como** contador, **quero** ver e pesquisar a carteira de empresas **para** encontrar rapidamente um cliente.

- [ ] Lista paginada com pesquisa por nome ou CNPJ.
- [ ] Mostra apenas empresas do meu escritório.
- [ ] Funciona em telemóvel e desktop.

### US08 — Preencher o perfil tributário

**Como** contador, **quero** registar os dados tributários de uma empresa (regime, CNAE, localização, faturamento, folha, período) **para** que ela possa ser analisada.

- [ ] Valores monetários não aceitam negativos.
- [ ] Campos em falta ficam marcados como ausentes; o sistema não inventa valores.
- [ ] Alterações ficam no registo de auditoria.

## Tax Engine

### US09 — Executar análise do Fator R

**Como** contador, **quero** executar a análise do Fator R do Simples Nacional **para** saber se a empresa se enquadra no Anexo III ou V e qual a alíquota efetiva.

- [ ] Usa a versão da regra publicada e vigente no período de referência.
- [ ] Sem dados obrigatórios, a análise fica `INCOMPLETE` e lista o que falta.
- [ ] A análise guarda snapshot da entrada, versão da regra, checksum e trace; é imutável.
- [ ] Reexecutar com a mesma entrada e versão produz resultado idêntico (teste de replay).
- [ ] Nenhum LLM participa no cálculo.

## Tax Radar

### US10 — Ver o Tax Radar da carteira

**Como** contador, **quero** ver a carteira classificada por prioridade **para** saber onde olhar primeiro.

- [ ] Cada empresa aparece com um estado: `DADOS_INCOMPLETOS`, `REVISAR_REGRA`, `REQUER_ANALISE`, `OPORTUNIDADE_PARA_AVALIAR` ou `NORMAL`.
- [ ] Ordenação por pontuação de prioridade determinística.
- [ ] Resumo com a contagem por estado.
- [ ] No telemóvel, o Radar aparece em cartões.

### US11 — Entender o porquê de um sinal

**Como** contador, **quero** ver a explicação de cada sinal do Radar **para** confiar na recomendação e decidir por mim.

- [ ] Cada sinal mostra motivo, regra e versão usadas, dados considerados, ausências e premissas.
- [ ] A página da análise tem link para a empresa e para a versão da regra.

## Importação

### US12 — Importar empresas por CSV/XLSX

**Como** sócio, **quero** importar a carteira a partir de um ficheiro exportado do meu sistema **para** não ter de cadastrar empresa a empresa.

- [ ] Aceita CSV e XLSX, com limite de tamanho e de linhas.
- [ ] Mostra uma prévia (novas, atualizadas, com erro) antes de gravar.
- [ ] Nada é gravado até à confirmação; a confirmação é transacional.
- [ ] A importação pode ser cancelada.

### US13 — Resolver conflitos da importação

**Como** sócio, **quero** ver duplicados e contradições na importação **para** decidir o que fazer com eles.

- [ ] Deduplicação por mapeamento externo, depois por CNPJ dentro do escritório.
- [ ] Conflitos são mostrados e nunca aplicados automaticamente.
- [ ] O resumo da importação fica disponível no histórico.

## Simulação, histórico e auditoria

### US14 — Simular cenários

**Como** contador, **quero** comparar cenários (ex.: alterar a folha) **para** avaliar o impacto antes de aconselhar o cliente.

- [ ] Uma simulação tem vários cenários com nomes distintos.
- [ ] Os cenários usam o mesmo Tax Engine das análises.
- [ ] Simular não altera o perfil tributário real da empresa.

### US15 — Consultar o histórico de análises

**Como** contador, **quero** ver as análises anteriores de uma empresa **para** acompanhar a evolução e justificar decisões passadas.

- [ ] Lista por data (mais recente primeiro) com estado e versão da regra.
- [ ] Análises antigas continuam a mostrar o resultado original, mesmo após nova versão da regra.

### US16 — Consultar o registo de auditoria

**Como** sócio, **quero** ver quem fez o quê e quando **para** ter rastreabilidade no escritório.

- [ ] Registo apenas de inserção, filtrado pelo meu escritório.
- [ ] Inclui login, alterações de empresas e perfis, importações, análises e simulações.
- [ ] Apenas `ADMIN` consulta o registo.
