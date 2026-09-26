# TRIBU.IO

**Definição Oficial do Produto — SaaS Web de Inteligência Tributária**

## 1. Visão do produto

Tribu.io é um SaaS Web B2B desenvolvido para escritórios de contabilidade, com o objetivo de funcionar como uma camada de inteligência tributária sobre a carteira de empresas já administrada pelo escritório.

O produto não pretende substituir o sistema contábil, fiscal ou de gestão utilizado pelo escritório e não pretende substituir o julgamento do contador.

Seu objetivo é utilizar os dados disponíveis das empresas clientes para:

- organizar e centralizar informações relevantes;

- identificar dados incompletos ou inconsistentes;

- realizar análises tributárias determinísticas;

- comparar cenários;

- identificar situações que merecem atenção;

- priorizar quais empresas deveriam ser analisadas primeiro;

- explicar por que determinada empresa foi sinalizada;

- manter histórico das análises;

- registrar regras e versões utilizadas;

- permitir acompanhamento contínuo da carteira.

A proposta central do produto é:

> O sistema encontra onde o contador deveria olhar primeiro.

## 2. Problema

Escritórios de contabilidade podem administrar dezenas ou centenas de empresas simultaneamente.

O problema não é apenas calcular tributos.

Existe também o problema de saber:

- quais empresas precisam de atenção;

- quais possuem dados incompletos;

- quais situações merecem uma nova análise;

- quais mudanças podem justificar uma simulação;

- quais clientes estão sendo analisados com informações desatualizadas;

- quais oportunidades tributárias podem existir e precisam ser avaliadas profissionalmente.

Grande parte dessas atividades pode depender de informações espalhadas em diferentes sistemas, planilhas, processos internos e conhecimento individual dos profissionais.

O produto pretende reduzir esse trabalho operacional e transformar a carteira de clientes em uma fila de análise priorizada.

## 3. Público-alvo

O público-alvo inicial são pequenos e médios escritórios de contabilidade.

O usuário principal é o profissional contábil responsável pela análise das empresas clientes.

Outros usuários possíveis:

- sócio/proprietário do escritório;

- administrador;

- contador;

- analista fiscal;

- analista contábil;

- usuário com acesso somente para consulta.

O perfil exato do cliente ideal deverá ser validado com escritórios reais antes da expansão comercial do produto.

## 4. Proposta de valor

O produto não deve competir diretamente com ERPs contábeis completos.

Ele deve funcionar como uma camada adicional de inteligência.

O escritório continua utilizando seu sistema principal para administrar sua operação.

O Tribu.io:

1. recebe ou importa os dados relevantes;

2. normaliza e valida esses dados;

3. mantém as informações necessárias para análise;

4. aplica regras tributárias versionadas;

5. executa análises determinísticas;

6. identifica situações que merecem atenção;

7. prioriza a carteira;

8. permite ao contador investigar;

9. permite simular cenários;

10. mantém histórico e rastreabilidade.

## 5. Integração com os sistemas existentes

Uma característica fundamental do produto é evitar que o escritório tenha que cadastrar manualmente todos os seus clientes novamente.

O sistema deverá ser projetado desde o início para trabalhar com uma camada de integração.

A arquitetura deverá permitir diferentes fontes de dados:

- APIs de sistemas externos;

- webhooks;

- importação CSV;

- importação XLSX;

- integrações futuras com ERPs e sistemas contábeis;

- outras fontes estruturadas autorizadas.

A primeira versão poderá utilizar importação de CSV/XLSX para demonstrar o conceito sem depender de integrações proprietárias.

Posteriormente, deverão ser desenvolvidos conectores para os sistemas mais utilizados pelos clientes reais do produto.

A escolha dos primeiros conectores deverá ser baseada em entrevistas e validação com escritórios, e não em suposições.

## 6. Arquitetura de integração

O sistema deverá possuir uma camada de integração independente do domínio principal.

Fluxo conceitual:

Sistema externo  
→ Integration Layer  
→ Normalização  
→ Validação  
→ Deduplicação  
→ Mapeamento  
→ Domínio do SaaS  
→ Tax Engine  
→ Tax Radar

O domínio interno não deverá depender diretamente de um fornecedor específico.

Não devem existir estruturas como:

ERP\_A\_ID  
ERP\_B\_ID  
ERP\_C\_ID

diretamente na entidade Company.

Deverá existir uma estrutura de mapeamento entre a empresa interna e os identificadores externos.

Exemplo conceitual:

Company  
→ ExternalCompanyMapping  
→ Integration  
→ External System

Isso permitirá adicionar novos conectores sem modificar o núcleo do produto.

## 7. Importação e sincronização

O sistema deverá tratar a importação como um processo controlado.

Exemplo:

O escritório possui 237 empresas no sistema externo.

Após uma importação, o SaaS poderá informar:

- 228 empresas novas;

- 7 empresas já existentes;

- 2 registros com conflitos;

- 0 erros críticos.

Antes de confirmar uma importação relevante, o usuário deverá visualizar uma prévia.

O sistema deverá evitar duplicidades e utilizar identificadores confiáveis para reconhecer empresas existentes.

Quando aplicável, o CNPJ poderá ser utilizado como identificador de negócio, acompanhado das validações necessárias.

No futuro, integrações por API poderão permitir:

- sincronização manual;

- sincronização periódica;

- sincronização incremental;

- webhooks;

- processamento assíncrono;

- detecção de alterações;

- atualização automática das informações relevantes.

## 8. Multi-tenancy

O produto será um SaaS multi-tenant.

Cada escritório representa um tenant.

Conceitualmente:

AccountingFirm  
→ Users  
→ Companies  
→ TaxProfiles  
→ Analyses  
→ Simulations  
→ AuditLogs

Os dados de um escritório jamais poderão ser acessados por outro escritório.

A separação entre tenants deverá ser implementada na arquitetura e validada por testes automatizados.

Essa regra é uma das principais propriedades de segurança do sistema.

## 9. Principais entidades do domínio

O modelo inicial deverá conter somente entidades necessárias ao funcionamento real do MVP.

Entidades principais:

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

Novas entidades somente deverão ser adicionadas quando houver uma necessidade funcional ou arquitetural clara.

## 10. Tax Profile

Cada empresa possuirá um conjunto de informações tributárias relevantes para as análises.

Exemplos:

- regime tributário;

- CNAE/atividade;

- localização;

- faturamento;

- folha;

- período de referência;

- demais informações necessárias para determinada regra.

O sistema deverá diferenciar:

- informação conhecida;

- informação ausente;

- informação inconsistente;

- informação desatualizada.

O sistema não deverá inventar dados ausentes.

Quando os dados necessários não estiverem disponíveis, a análise deverá indicar que não pode ser concluída adequadamente.

## 11. Tax Engine

O núcleo tributário deverá ser determinístico, auditável e versionado.

O Tax Engine será responsável por executar regras de negócio tributárias a partir dos dados disponíveis.

As regras não deverão ficar:

- em controllers;

- no frontend;

- espalhadas pelo código;

- dentro de prompts de IA;

- dependentes de respostas de um modelo de linguagem.

As regras deverão possuir versão e período de validade.

Conceitualmente:

TaxRule

- id

- name

- type

- version

- validFrom

- validUntil

- conditions

- formula

- source

- active

Uma análise histórica deverá permanecer reproduzível.

Para isso, deverão ser armazenados, quando necessários:

- período;

- dados de entrada;

- snapshot dos dados relevantes;

- versão da regra;

- premissas;

- cenários;

- resultado;

- informações ausentes;

- usuário responsável;

- data da execução.

## 12. Tax Radar

O Tax Radar será a principal interface de priorização do produto.

Ele deverá responder:

> Quais empresas da carteira merecem atenção primeiro e por quê?

Exemplos de estados conceituais:

- NORMAL;

- DADOS\_INCOMPLETOS;

- REQUER\_ANALISE;

- OPORTUNIDADE\_PARA\_AVALIAR;

- REVISAR\_REGRA.

Esses estados são sinais para o profissional.

Eles não representam uma decisão tributária definitiva.

Cada sinal deverá possuir explicação suficiente para que o contador compreenda:

- o que foi identificado;

- quais dados foram utilizados;

- qual regra foi aplicada;

- qual versão da regra foi utilizada;

- quais informações estão faltando;

- quais premissas foram utilizadas;

- por que a empresa foi sinalizada.

## 13. Simulações

O sistema deverá permitir que o contador compare cenários.

Exemplo conceitual:

Empresa X  
→ situação atual  
→ cenário A  
→ cenário B  
→ diferença estimada  
→ premissas  
→ regras utilizadas

Os resultados deverão ser apresentados como estimativas e suporte à análise profissional.

O sistema não deverá apresentar uma simulação como decisão tributária definitiva.

## 14. Histórico

Cada análise relevante deverá possuir histórico.

O usuário deverá conseguir entender:

- quando a análise foi realizada;

- por quem;

- quais dados foram utilizados;

- quais regras foram utilizadas;

- qual versão das regras estava vigente;

- quais cenários foram avaliados;

- qual foi o resultado;

- quais informações estavam ausentes.

Uma alteração futura na regra tributária não deverá modificar silenciosamente uma análise histórica.

## 15. Auditabilidade

O produto deverá possuir trilha de auditoria para eventos relevantes.

Exemplos:

- login;

- alterações relevantes;

- importações;

- sincronizações;

- alterações de dados tributários;

- execução de análises;

- execução de simulações;

- alterações administrativas.

A auditoria deverá ser estruturada para permitir investigação posterior.

## 16. Inteligência Artificial

A inteligência artificial não será utilizada como mecanismo principal de cálculo tributário.

A arquitetura desejada é:

Dados  
→ Tax Engine determinístico  
→ Resultado auditável  
→ IA para explicação e assistência

A IA poderá futuramente:

- explicar uma análise;

- resumir resultados;

- explicar mudanças regulatórias;

- gerar relatórios;

- auxiliar na investigação;

- identificar inconsistências;

- responder perguntas sobre os dados;

- auxiliar o profissional durante a análise.

A IA não deverá decidir sozinha qual tributo deve ser pago nem substituir as regras determinísticas do sistema.

## 17. Responsabilidade profissional

O produto é uma ferramenta de apoio à decisão.

Ele não substitui:

- contador;

- advogado tributarista;

- consultor tributário;

- julgamento profissional.

Resultados deverão possuir contexto, premissas e limitações suficientes para evitar falsa precisão.

Quando não houver dados suficientes, o sistema deverá informar explicitamente essa condição.

## 18. Segurança

O produto deverá seguir princípios de segurança desde o início.

Requisitos:

- autenticação segura;

- senhas armazenadas com hash adequado;

- autorização;

- isolamento entre tenants;

- validação de entrada;

- proteção contra acesso indevido;

- tratamento seguro de erros;

- secrets exclusivamente em variáveis de ambiente/secret management;

- ausência de credenciais hardcoded;

- logs controlados;

- proteção contra vulnerabilidades comuns do OWASP;

- rate limiting quando apropriado;

- CORS configurado adequadamente;

- headers de segurança;

- princípio do menor privilégio.

## 19. LGPD e proteção de dados

O sistema deverá aplicar princípios de:

- minimização;

- finalidade;

- controle de acesso;

- rastreabilidade;

- retenção adequada;

- proteção dos dados.

Somente dados necessários para o funcionamento do produto deverão ser armazenados.

Dados reais de clientes não deverão ser utilizados no repositório ou em seeds.

O ambiente de desenvolvimento deverá utilizar dados fictícios.

## 20. Stack tecnológica

A implementação inicial deverá utilizar:

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

Banco:

- PostgreSQL

- Prisma

Infraestrutura:

- Docker

- Docker Compose

Versionamento:

- Git

- GitHub

CI:

- GitHub Actions

Arquitetura:

- Modular Monolith

O sistema não deverá ser dividido em microserviços no MVP sem uma necessidade concreta.

## 21. Estrutura do projeto

Estrutura inicial esperada:

product/  
├── frontend/  
├── backend/  
├── infra/  
│ ├── docker/  
│ └── scripts/  
├── docs/  
├── .github/  
│ └── workflows/  
├── docker-compose.yml  
├── .env.example  
├── .gitignore  
└── README.md

## 22. Módulos principais do backend

Arquitetura conceitual:

- auth

- users

- accounting-firms

- companies

- tax-profiles

- tax-rules

- tax-calculations

- radar

- simulations

- analyses

- integrations

- audit

- common

Os módulos deverão possuir responsabilidades bem definidas e baixo acoplamento.

## 23. Módulos principais do frontend

Arquitetura conceitual:

- app

- auth

- dashboard

- companies

- tax-profile

- radar

- simulations

- analyses

- integrations

- settings

- shared

A interface deverá ser responsiva e adequada para uso em desktop e notebook, mantendo compatibilidade com navegadores modernos.

## 24. MVP

O MVP deverá demonstrar o seguinte fluxo completo:

Login  
→ Escritório  
→ Clientes  
→ Importação de clientes  
→ Dados tributários  
→ Tax Engine  
→ Tax Radar  
→ Análise  
→ Simulação  
→ Resultado explicado  
→ Histórico

O MVP deverá possuir:

- autenticação;

- multi-tenancy;

- empresas;

- importação em lote;

- perfil tributário;

- primeira regra tributária;

- cálculo determinístico;

- Tax Radar;

- simulação;

- histórico;

- auditoria;

- API REST;

- Swagger/OpenAPI;

- PostgreSQL;

- migrations;

- seeds;

- testes;

- Docker Compose;

- CI;

- documentação;

- deploy.

## 25. O que NÃO faz parte do MVP

Não implementar sem autorização explícita:

- ERP contábil completo;

- emissão fiscal;

- folha de pagamento;

- contabilidade completa;

- dezenas de integrações;

- aplicativo mobile;

- desktop app;

- microserviços;

- billing complexo;

- processamento massivo de documentos;

- IA como mecanismo de cálculo;

- automações não relacionadas ao objetivo principal;

- funcionalidades apenas porque parecem interessantes.

## 26. Princípio central do produto

O produto deve transformar:

Carteira de clientes  
→ dados  
→ análise  
→ priorização  
→ decisão profissional.

A principal pergunta do sistema deve ser:

> "Onde o contador deveria olhar primeiro?"

E não:

> "Como podemos substituir o trabalho do contador?"

## 27. Visão de longo prazo

O produto poderá evoluir para uma plataforma de inteligência tributária contínua.

A evolução poderá incluir:

- múltiplos conectores;

- sincronização automática;

- monitoramento contínuo;

- alertas;

- novas regras tributárias;

- histórico avançado;

- relatórios;

- integrações com ERPs;

- IA assistiva;

- planos SaaS;

- métricas;

- observabilidade;

- processamento assíncrono;

- filas;

- workers;

- maior escala.

A expansão deverá acontecer somente quando houver necessidade validada.

## 28. Critério fundamental de sucesso

O produto será bem-sucedido quando um escritório conseguir conectar ou importar sua carteira de clientes e, sem precisar cadastrar empresa por empresa, receber uma visão organizada e priorizada das empresas que precisam de atenção.

O sistema deve reduzir o trabalho operacional de coleta e organização de informações e aumentar a capacidade do profissional de concentrar seu tempo na análise.

O produto não vende simplesmente "cálculo tributário".

Ele vende:

> **visibilidade, priorização e inteligência sobre a carteira tributária do escritório.**

