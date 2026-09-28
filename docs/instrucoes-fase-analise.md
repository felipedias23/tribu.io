# Etapa 01 — Instruções ao Agente de Desenvolvimento

> **Histórico.** Instruções da fase de análise, concluída com a aprovação de [arquitetura-e-decisoes.md](arquitetura-e-decisoes.md) em 2026-09-26. Não são instruções em vigor: as decisões aprovadas e a Definition of Done atual estão nos documentos vigentes do [índice da documentação](README.md).

Você será o principal agente de desenvolvimento responsável pela implementação deste projeto SaaS Web.

Antes de escrever qualquer código de produção, você deve compreender completamente o projeto, inspecionar o ambiente disponível e produzir um plano técnico de implementação.

## 1. CONTEXTO DO PROJETO

Estamos desenvolvendo um SaaS Web B2B para escritórios de contabilidade.

O produto funciona como uma camada de inteligência tributária sobre a carteira de empresas que o escritório já administra.

A proposta central é:

> **O sistema encontra onde o contador deveria olhar primeiro.**

O produto deverá permitir que o escritório:

- importe ou sincronize sua carteira de clientes;

- mantenha informações tributárias relevantes;

- identifique dados incompletos ou inconsistentes;

- execute análises tributárias determinísticas;

- compare cenários;

- identifique situações que merecem atenção;

- priorize empresas;

- visualize explicações;

- mantenha histórico;

- tenha rastreabilidade das análises;

- futuramente conecte diferentes sistemas contábeis/ERPs.

O produto NÃO pretende substituir o sistema contábil utilizado pelo escritório e NÃO pretende substituir o julgamento do profissional contábil.

## 2. PRINCÍPIO ARQUITETURAL CENTRAL

O sistema deverá ser construído como uma camada de inteligência sobre sistemas existentes.

Fluxo conceitual:

Sistema externo  
→ Integration Layer  
→ Normalização  
→ Validação  
→ Deduplicação  
→ Domínio do SaaS  
→ Tax Engine  
→ Tax Radar  
→ Análise profissional

O núcleo do domínio não poderá depender diretamente de um ERP ou fornecedor específico.

A arquitetura deve permitir adicionar novos conectores no futuro sem reescrever o domínio principal.

## 3. STACK OBRIGATÓRIA

Frontend:

- React

- TypeScript

- Vite

- Vitest

- Testing Library

Backend:

- NestJS

- TypeScript

- Jest

- REST

- Swagger/OpenAPI

Database:

- PostgreSQL

- Prisma

Infraestrutura:

- Docker

- Docker Compose

CI:

- GitHub Actions

Versionamento:

- Git

- GitHub

Arquitetura:

- Modular Monolith

Não adote microserviços no MVP.

## 4. PRIMEIRA REGRA

NÃO comece implementando funcionalidades.

Primeiro:

1. inspecione o repositório;

2. inspecione todos os arquivos existentes;

3. identifique o estado atual do projeto;

4. identifique a estrutura existente;

5. identifique tecnologias já instaladas;

6. verifique versões;

7. verifique Docker;

8. verifique banco;

9. verifique configurações;

10. verifique scripts;

11. verifique testes;

12. verifique lint;

13. verifique build;

14. verifique variáveis de ambiente;

15. identifique problemas existentes.

Não apague, substitua ou reestruture código existente sem justificar a necessidade.

## 5. NÃO INVENTE REQUISITOS

A documentação fornecida representa a especificação principal do produto.

Não adicione funcionalidades apenas porque parecem interessantes.

Se uma decisão importante não estiver definida:

1. identifique a lacuna;

2. apresente a decisão necessária;

3. proponha uma alternativa técnica;

4. aguarde autorização quando a decisão alterar significativamente o domínio ou escopo.

Não transforme hipóteses em requisitos.

## 6. PRIMEIRA FASE: ANÁLISE

Após inspecionar o projeto, produza um relatório contendo:

### Estado atual

- estrutura do projeto;

- tecnologias;

- versões;

- arquivos relevantes;

- funcionalidades existentes;

- problemas encontrados.

### Arquitetura proposta

Explique:

- frontend;

- backend;

- database;

- autenticação;

- multi-tenancy;

- módulos;

- integração;

- Tax Engine;

- Tax Radar;

- testes;

- infraestrutura.

### Modelo de domínio

Identifique as entidades necessárias para o MVP.

Considere inicialmente:

- AccountingFirm

- User

- Company

- TaxProfile

- TaxRule

- TaxRuleVersion

- Analysis

- AnalysisInput

- Simulation

- SimulationScenario

- AuditLog

- Integration

- ExternalCompanyMapping

Não crie todas automaticamente.

Justifique cada entidade e identifique quais são realmente necessárias na primeira implementação.

### Banco de dados

Apresente:

- relacionamentos;

- cardinalidades;

- chaves;

- índices;

- constraints;

- estratégia de migrations;

- estratégia de seed;

- estratégia de isolamento entre tenants.

### API

Proponha os módulos e principais endpoints REST necessários para o MVP.

### Frontend

Proponha:

- rotas;

- páginas;

- módulos;

- estados;

- autenticação;

- fluxo de navegação.

### Integrações

Defina a arquitetura para:

- CSV;

- XLSX;

- APIs externas futuras;

- sincronização;

- mapeamento de empresas;

- deduplicação;

- validação;

- conflitos.

A primeira implementação não precisa possuir integrações proprietárias se ainda não houver uma definida.

## 7. TAX ENGINE

O Tax Engine deverá ser determinístico.

NÃO utilize LLM para realizar cálculos tributários.

NÃO coloque regras tributárias diretamente em controllers.

NÃO coloque regras tributárias diretamente no frontend.

As regras devem possuir versionamento e validade temporal.

Uma análise histórica deverá ser reproduzível.

Explique como a arquitetura proposta garante isso.

## 8. TAX RADAR

O Tax Radar deve funcionar como mecanismo de priorização.

Estados conceituais:

- NORMAL

- DADOS\_INCOMPLETOS

- REQUER\_ANALISE

- OPORTUNIDADE\_PARA\_AVALIAR

- REVISAR\_REGRA

Esses estados são sinais e não decisões tributárias definitivas.

A arquitetura deve permitir explicar por que uma empresa recebeu determinado status.

## 9. MULTI-TENANCY

AccountingFirm é o tenant.

Os dados deverão ser isolados por escritório.

Nenhum usuário poderá acessar empresas, análises, simulações ou dados pertencentes a outro tenant.

A arquitetura deverá tornar esse isolamento explícito.

Também deverão existir testes automatizados que validem esse comportamento.

## 10. SEGURANÇA

Considere desde o início:

- autenticação;

- autorização;

- hashing seguro de senha;

- tenant isolation;

- validação de entrada;

- tratamento seguro de erros;

- CORS;

- security headers;

- rate limiting quando apropriado;

- secrets em environment variables;

- nenhum secret hardcoded;

- logs seguros;

- OWASP;

- princípio do menor privilégio.

Não implemente atalhos inseguros apenas para acelerar o desenvolvimento.

## 11. DADOS E LGPD

Utilize somente os dados necessários.

Seeds deverão conter dados fictícios.

Não utilizar dados reais de clientes.

Considere:

- minimização;

- controle de acesso;

- finalidade;

- retenção;

- auditoria;

- proteção de dados.

## 12. QUALIDADE

O projeto deverá seguir:

- SOLID quando aplicável;

- DRY;

- KISS;

- separação de responsabilidades;

- baixo acoplamento;

- alta coesão;

- código legível;

- nomes claros;

- validações;

- tratamento de erros;

- testes automatizados.

Não crie abstrações excessivas apenas para parecer arquiteturalmente sofisticado.

## 13. TESTES

O projeto precisa atender aos requisitos acadêmicos:

Backend:  
mínimo de 10 testes automatizados.

Frontend:  
mínimo de 3 testes automatizados.

Além da quantidade mínima, testes devem cobrir comportamentos importantes.

Prioridades:

- autenticação;

- autorização;

- tenant isolation;

- empresas;

- importação;

- validação;

- Tax Engine;

- Tax Radar;

- simulação.

## 14. DOCKER

O projeto deve poder ser iniciado em uma máquina limpa utilizando Docker Compose.

Objetivo:

docker compose up

deve iniciar os serviços necessários.

O ambiente deverá possuir:

- backend;

- frontend quando apropriado;

- PostgreSQL;

- migrations;

- seeds quando apropriado.

Documente claramente o processo.

## 15. CI

O GitHub Actions deverá executar pelo menos:

- instalação;

- lint;

- testes;

- build.

O pipeline deverá falhar quando houver problemas.

## 16. DOCUMENTAÇÃO

O projeto deverá possuir README contendo:

- descrição;

- arquitetura;

- requisitos;

- instalação;

- execução;

- variáveis de ambiente;

- migrations;

- seed;

- testes;

- contas de teste;

- documentação da API;

- estrutura do projeto;

- decisões arquiteturais relevantes.

## 17. ORDEM DE IMPLEMENTAÇÃO

Depois da análise e aprovação do plano, a implementação deverá seguir aproximadamente esta ordem:

1. infraestrutura/repositório;

2. Docker;

3. PostgreSQL;

4. backend base;

5. Prisma;

6. migrations;

7. autenticação;

8. multi-tenancy;

9. usuários;

10. AccountingFirm;

11. Company;

12. importação;

13. TaxProfile;

14. TaxRule/TaxRuleVersion;

15. Tax Engine;

16. Tax Radar;

17. Analysis;

18. Simulation;

19. histórico;

20. AuditLog;

21. frontend;

22. integração frontend/backend;

23. testes;

24. CI;

25. segurança;

26. documentação;

27. deploy.

Essa ordem pode ser ajustada se você identificar uma dependência técnica melhor, mas qualquer mudança significativa deverá ser justificada.

## 18. DEFINITION OF DONE

Uma funcionalidade somente será considerada concluída quando:

- requisito estiver implementado;

- critérios de aceitação estiverem atendidos;

- validações estiverem implementadas;

- autorização estiver correta;

- testes relevantes existirem;

- testes passarem;

- lint passar;

- build passar;

- migrations estiverem corretas quando aplicável;

- não existirem secrets hardcoded;

- integração estiver validada;

- documentação relevante estiver atualizada.

## 19. REGRAS DE COMPORTAMENTO DO AGENTE

Você deverá:

- analisar antes de modificar;

- explicar decisões arquiteturais importantes;

- evitar mudanças desnecessárias;

- não adicionar dependências sem justificativa;

- não inventar requisitos;

- não implementar funcionalidades fora do escopo;

- não utilizar IA para substituir lógica determinística;

- não introduzir microserviços no MVP;

- não ignorar testes;

- não ignorar segurança;

- não ignorar migrations;

- não mascarar erros;

- não considerar uma funcionalidade concluída apenas porque o código compila.

Sempre que encontrar um problema, informe:

1. problema;

2. causa provável;

3. impacto;

4. solução proposta;

5. arquivos afetados;

6. testes necessários.

## 20. SUA PRIMEIRA TAREFA

NÃO implemente funcionalidades ainda.

Faça somente:

1. inspeção completa do repositório;

2. análise do ambiente;

3. análise da arquitetura existente;

4. identificação de lacunas;

5. proposta de arquitetura;

6. proposta inicial do modelo de dados;

7. proposta dos módulos;

8. proposta da estratégia de integração;

9. proposta da estratégia de testes;

10. proposta da estratégia Docker/CI;

11. identificação dos principais riscos técnicos;

12. plano de implementação incremental.

Ao final, entregue um relatório técnico estruturado.

Não escreva código de produção nesta primeira etapa.

Aguarde aprovação antes de iniciar a implementação.

## 21. PRINCÍPIO FINAL

O objetivo não é simplesmente produzir código.

O objetivo é construir um SaaS Web real, modular, seguro, testável, auditável e evolutivo, capaz de começar como projeto acadêmico e possuir uma arquitetura suficientemente sólida para posteriormente evoluir para um produto comercial.

Priorize:

correção  
→ segurança  
→ clareza  
→ auditabilidade  
→ manutenção  
→ testes  
→ simplicidade  
→ escalabilidade quando necessária.

Não otimize prematuramente.

Construa primeiro um núcleo correto e compreensível.

