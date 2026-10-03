# Modelo de dados (diagrama ER)

Modelo relacional planeado para o MVP em PostgreSQL, derivado do [relatório técnico §4](arquitetura-e-decisoes.md#4-modelo-de-dados). A justificação da tecnologia está no [ADR 0001](adr/0001-postgresql-prisma.md).

As tabelas são criadas incrementalmente, via Prisma Migrate, na semana em que cada funcionalidade é implementada (ver [cronograma](arquitetura-e-decisoes.md#8-cronograma-8-semanas-semana-0--2026-09-26)). Este diagrama é o alvo; os nomes finais das colunas podem ajustar-se na implementação.

## Diagrama

```mermaid
erDiagram
    AccountingFirm ||--o{ User : "tem"
    AccountingFirm ||--o{ Company : "administra"
    AccountingFirm ||--o{ Integration : "configura"
    AccountingFirm ||--o{ ImportBatch : "importa"
    AccountingFirm ||--o{ AuditLog : "regista"
    Company ||--o| TaxProfile : "tem"
    Company ||--o{ Analysis : "é analisada em"
    Company ||--o{ Simulation : "é simulada em"
    Company ||--o{ ExternalCompanyMapping : "é mapeada por"
    Integration ||--o{ ExternalCompanyMapping : "mapeia"
    Integration ||--o{ ImportBatch : "origina"
    TaxRule ||--o{ TaxRuleVersion : "tem"
    TaxRuleVersion ||--o{ Analysis : "usada em"
    TaxRuleVersion ||--o{ Simulation : "usada em"
    Simulation ||--|{ SimulationScenario : "compara"
    User ||--o{ Analysis : "executa"
    User ||--o{ Simulation : "cria"
    User ||--o{ AuditLog : "é autor de"

    AccountingFirm {
        uuid id PK
        string name
        string cnpj UK "opcional"
        datetime createdAt
        datetime updatedAt
    }
    User {
        uuid id PK
        uuid accountingFirmId FK
        string email UK "minúsculas"
        string passwordHash "argon2"
        string name
        enum role "ADMIN | ANALYST | VIEWER"
        int tokenVersion "invalida sessões no logout"
        datetime createdAt
        datetime updatedAt
    }
    Company {
        uuid id PK
        uuid accountingFirmId FK
        string cnpj "único por escritório"
        string legalName
        string tradeName "opcional"
        datetime createdAt
        datetime updatedAt
    }
    TaxProfile {
        uuid id PK
        uuid companyId FK "único (1:1)"
        uuid accountingFirmId FK
        enum taxRegime
        string cnae
        string city
        string state
        decimal revenue12m "Decimal(15,2)"
        decimal payroll12m "Decimal(15,2)"
        date referencePeriod "1.º dia do mês"
        datetime createdAt
        datetime updatedAt
    }
    TaxRule {
        uuid id PK
        string code UK "ex.: SIMPLES_FATOR_R"
        string name
        string description
    }
    TaxRuleVersion {
        uuid id PK
        uuid taxRuleId FK
        int version
        date validFrom
        date validUntil "nulo = em vigor"
        jsonb parameters
        string source "base legal"
        string evaluatorKey "ex.: SIMPLES_FATOR_R@1"
        enum status "DRAFT | PUBLISHED | SUPERSEDED"
        string checksum
    }
    Analysis {
        uuid id PK
        uuid accountingFirmId FK
        uuid companyId FK
        uuid taxRuleVersionId FK
        uuid executedById FK
        jsonb inputSnapshot
        string parametersChecksum
        string engineVersion
        enum status "COMPLETED | INCOMPLETE"
        enum radarStatus
        jsonb result
        jsonb trace "raciocínio, ausências, premissas"
        datetime executedAt
    }
    Simulation {
        uuid id PK
        uuid accountingFirmId FK
        uuid companyId FK
        uuid taxRuleVersionId FK
        uuid createdById FK
        datetime createdAt
    }
    SimulationScenario {
        uuid id PK
        uuid accountingFirmId FK
        uuid simulationId FK
        string label "único por simulação"
        jsonb inputs
        jsonb result
    }
    AuditLog {
        uuid id PK
        uuid accountingFirmId FK
        uuid userId FK
        string action
        string entityType
        uuid entityId
        jsonb metadata
        datetime createdAt
    }
    Integration {
        uuid id PK
        uuid accountingFirmId FK
        enum type "CSV | XLSX"
        string name
        datetime createdAt
    }
    ExternalCompanyMapping {
        uuid id PK
        uuid accountingFirmId FK
        uuid integrationId FK
        uuid companyId FK
        string externalId
    }
    ImportBatch {
        uuid id PK
        uuid accountingFirmId FK
        uuid integrationId FK
        uuid createdById FK
        enum status "PREVIEW | CONFIRMED | CANCELLED"
        jsonb preview
        jsonb summary
        datetime createdAt
    }
```

## Restrições e índices

| Tabela | Restrição / índice | Motivo |
|---|---|---|
| User | `email` único; único `(id, accountingFirmId)`; índice `accountingFirmId` | Login por email; alvo das FKs compostas de Analysis, Simulation, AuditLog e ImportBatch; listagem por escritório |
| Company | únicos `(accountingFirmId, cnpj)` e `(id, accountingFirmId)`; índice `(accountingFirmId, legalName)` | CNPJ não repete dentro do escritório; o par `(id, accountingFirmId)` é alvo das FKs compostas |
| TaxProfile | único `(companyId, accountingFirmId)` (um perfil por empresa); FK composta → Company; `CHECK` valores ≥ 0; campos tributários anuláveis | Um perfil por empresa, do mesmo tenant; nulo = dado ausente, distinto de zero (D20) |
| TaxRule | `code` único | Catálogo global de regras |
| TaxRuleVersion | único `(taxRuleId, version)`; `CHECK validUntil > validFrom`; `EXCLUDE` sobreposição de vigência | Só uma versão vigente por período |
| Analysis | FKs compostas → Company e User; índices `(accountingFirmId, companyId, executedAt DESC)` e `(accountingFirmId, radarStatus)` | Histórico por empresa; filtros do Radar |
| Simulation | FKs compostas → Company e User; único `(id, accountingFirmId)` | Isolamento entre tenants; alvo da FK composta de SimulationScenario |
| SimulationScenario | FK composta → Simulation; único `(simulationId, label)` | Cenários com nome distinto, do mesmo tenant da simulação |
| AuditLog | apenas inserção (append-only); FK composta → User; índice `(accountingFirmId, createdAt DESC)` | Trilho de auditoria imutável |
| Integration | únicos `(accountingFirmId, type, name)` e `(id, accountingFirmId)` | Integrações nomeadas por escritório; alvo das FKs compostas |
| ExternalCompanyMapping | FKs compostas → Integration e Company; únicos `(integrationId, externalId)` e `(integrationId, companyId)` | IDs externos ficam fora de `Company` |
| ImportBatch | FKs compostas → Integration e User; índice `(accountingFirmId, createdAt DESC)` | Histórico de importações |

**FK composta (decisão D15):** toda FK entre tabelas do tenant inclui o escritório, por exemplo `(companyId, accountingFirmId)` → `Company(id, accountingFirmId)`. Por isso as tabelas que são pai (Company, User, Simulation, Integration) têm único `(id, accountingFirmId)`. Assim o banco rejeita qualquer registo que ligue um escritório a dados de outro. As FKs para o catálogo global (`TaxRuleVersion`) são simples. As regras completas estão em [seguranca.md](seguranca.md#schema-d15).

## Convenções

- IDs `UUID`.
- Valores monetários em `Decimal(15,2)`.
- Toda entidade do tenant tem `accountingFirmId`, incluindo as tabelas filhas (D15); `TaxRule` e `TaxRuleVersion` são catálogo global.
- `Analysis` é imutável: uma nova execução cria um novo registo.
- `AnalysisInput` da especificação é guardado como `inputSnapshot` (JSONB) em `Analysis` (decisão D6).
- O estado do Tax Radar é derivado (não é tabela); `Analysis.radarStatus` guarda o estado calculado em cada execução.
