# Tribu.io — Diretrizes de Desenvolvimento e Contexto do Projeto

## 1. Visão Geral do Produto
O **Tribu.io** é um SaaS Web B2B para escritórios de contabilidade que atua como uma camada de inteligência tributária e priorização sobre a carteira de empresas administrada pelo escritório.
- **Proposta Central:** "O sistema encontra onde o contador deveria olhar primeiro."
- **NÃO é:** Um ERP contábil, um emissor fiscal ou um substituto do julgamento do contador.

---

## 2. Stack Tecnológica Obrigatória
- **Arquitetura:** Modular Monolith (Sem microserviços no MVP).
- **Backend:** NestJS, TypeScript, Jest, REST, Swagger/OpenAPI.
- **Frontend:** React, TypeScript, Vite, Vitest, Testing Library.
- **Database:** PostgreSQL + Prisma ORM.
- **Infraestrutura:** Docker, Docker Compose, GitHub Actions (CI).

---

## 3. Regras Arquiteturais e de Domínio Cruciais

### Multi-tenancy & Isolamento
- `AccountingFirm` é a entidade do *tenant*.
- **Isolamento Total:** Nenhum usuário de um tenant pode acessar empresas, análises ou dados de outro tenant.
- Todos os endpoints e consultas ao banco devem validar estritamente o `tenantId`.

### Tax Engine (Núcleo Tributário)
- **Determinístico e Auditável:** NUNCA utilize LLM (IA) para realizar cálculos ou decisões tributárias.
- **Versionado:** Regras tributárias possuem versão e validade temporal (`validFrom`, `validUntil`). Análises históricas devem ser 100% reprodutíveis.
- **Isolamento de Código:** Regras tributárias NÃO devem ficar em controllers, frontend ou espalhadas no código.

### Tax Radar (Interface de Priorização)
- Mecanismo de sinalização da carteira.
- Estados conceituais: `NORMAL`, `DADOS_INCOMPLETOS`, `REQUER_ANALISE`, `OPORTUNIDADE_PARA_AVALIAR`, `REVISAR_REGRA`.
- Todo sinal deve conter uma explicação de qual regra/versão/dados foram utilizados.

### Camada de Integração
- O domínio principal não pode depender diretamente de ERPs ou sistemas externos (sem IDs de ERPs externos dentro da entidade `Company`).
- Usar mapeamento via `ExternalCompanyMapping` e `Integration Layer`.

---

## 4. Regras de Conduta e Qualidade para o Agente (Claude)

1. **Inspecione Antes de Agir:** Analise os arquivos existentes e o ambiente antes de sugerir ou implementar alterações.
2. **Não Invente Requisitos:** Siga estritamente as especificações do projeto. Se houver lacunas técnicas, proponha soluções e aguarde autorização.
3. **Não Escreva Código Sem Aprovação Prévias de Planos:** Apresente sempre a proposta arquitetural ou plano de implementação antes de gerar o código da funcionalidade.
4. **Qualidade & Testes:**
   - Mínimo de 10 testes no Backend e 3 no Frontend.
   - Siga princípios SOLID, DRY e KISS. Evite abstrações excessivas.
5. **Segurança & LGPD:**
   - NUNCA introduza *secrets* ou credenciais *hardcoded*.
   - Use apenas dados fictícios em seeds de desenvolvimento.

---

## 5. Definition of Done (DoD)
Uma funcionalidade só é considerada concluída se:
- [ ] Atende integralmente aos critérios de aceitação.
- [ ] Possui validações de entrada e verificações de autorização/tenant.
- [ ] Todo recurso do tenant tem teste e2e de isolamento com dois escritórios (ver `docs/autenticacao.md`).
- [ ] Possui testes automatizados cobrindo os cenários principais e eles estão passando.
- [ ] O *lint* e o *build* passam sem erros.
- [ ] As *migrations* do banco foram criadas/testadas (quando aplicável).
- [ ] A documentação/Swagger correspondente foi atualizada.

---

## 6. Comandos Úteis do Projeto
- **Iniciar ambiente:** `docker compose up -d`
- **Backend (NestJS):** `npm run start:dev` | `npm run test`
- **Frontend (Vite):** `npm run dev` | `npm run test`
- **Banco de Dados (Prisma):** `npx prisma migrate dev` | `npx prisma studio`