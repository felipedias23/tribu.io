# Modelo de dados (diagrama ER)

Modelo relacional planeado para o MVP em PostgreSQL, derivado do [relatório técnico §4](relatorio-fase1.md#4-modelo-de-dados). A justificação da tecnologia está no [ADR 0001](adr/0001-postgresql-prisma.md).

As tabelas são criadas incrementalmente, via Prisma Migrate, na semana em que cada funcionalidade é implementada (ver [cronograma](relatorio-fase1.md#8-cronograma-8-semanas-semana-0--2026-09-26)). Este diagrama é o alvo; os nomes finais das colunas podem ajustar-se na implementação.

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
    }
    Company {
        uuid id PK
        uuid accountingFirmId FK
        string cnpj "único por escritório"
        string legalName
        string tradeName
        datetime createdAt
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
        date referencePeriod
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
| User | `email` único; índice `accountingFirmId` | Login por email; listagem por escritório |
| Company | únicos `(accountingFirmId, cnpj)` e `(id, accountingFirmId)`; índice `(accountingFirmId, legalName)` | CNPJ não repete dentro do escritório; o par `(id, accountingFirmId)` é alvo das FKs compostas |
| TaxProfile | `companyId` único; FK composta; `CHECK` valores ≥ 0 | Um perfil por empresa, do mesmo tenant |
| TaxRule | `code` único | Catálogo global de regras |
| TaxRuleVersion | único `(taxRuleId, version)`; `CHECK validUntil > validFrom`; `EXCLUDE` sobreposição de vigência | Só uma versão vigente por período |
| Analysis | FK composta; índices `(accountingFirmId, companyId, executedAt DESC)` e `(accountingFirmId, radarStatus)` | Histórico por empresa; filtros do Radar |
| Simulation | FK composta | Isolamento entre tenants |
| SimulationScenario | único `(simulationId, label)` | Cenários com nome distinto |
| AuditLog | apenas inserção (append-only); índice `(accountingFirmId, createdAt DESC)` | Trilho de auditoria imutável |
| Integration | único `(accountingFirmId, type, name)` | Integrações nomeadas por escritório |
| ExternalCompanyMapping | únicos `(integrationId, externalId)` e `(integrationId, companyId)` | IDs externos ficam fora de `Company` |
| ImportBatch | índice `(accountingFirmId, createdAt DESC)` | Histórico de importações |

**FK composta:** as tabelas do tenant que apontam para uma empresa referenciam `(companyId, accountingFirmId)` → `Company(id, accountingFirmId)`. Assim o banco rejeita qualquer registo que ligue um escritório à empresa de outro.

## Convenções

- IDs `UUID`.
- Valores monetários em `Decimal(15,2)`.
- Toda entidade do tenant tem `accountingFirmId`; `TaxRule` e `TaxRuleVersion` são catálogo global.
- `Analysis` é imutável: uma nova execução cria um novo registo.
- `AnalysisInput` da especificação é guardado como `inputSnapshot` (JSONB) em `Analysis` (decisão D6).
- O estado do Tax Radar é derivado (não é tabela); `Analysis.radarStatus` guarda o estado calculado em cada execução.
