# ADR 0001 — PostgreSQL com Prisma como base de dados

- **Estado:** aceite
- **Data:** 2026-09-27
- **Contexto de decisão:** Semana 1 (arranque e desenho)

## Contexto

O [regras académicas](../regras-academicas.md) aceita PostgreSQL ou MongoDB, desde que a escolha seja justificada e os dados sejam modelados de acordo com a tecnologia. O Tribu.io tem requisitos de dados que pesam nessa decisão:

1. **Multi-tenancy com isolamento total.** Cada escritório (`AccountingFirm`) é um tenant e nenhum dado pode cruzar tenants ([relatório §3.3](../arquitetura-e-decisoes.md#33-multi-tenancy)).
2. **Dados fortemente relacionais.** Escritório → utilizadores e empresas → perfil tributário → análises e simulações; regras → versões → análises.
3. **Valores monetários.** Faturamento e folha alimentam cálculos tributários; erros de arredondamento são inaceitáveis.
4. **Reprodutibilidade e auditoria.** Versões de regra não se podem sobrepor no tempo, análises são imutáveis e guardam um snapshot da entrada ([relatório §3.4](../arquitetura-e-decisoes.md#34-tax-engine-reprodutibilidade)).
5. **Evolução versionada do esquema**, sem alterações manuais.

## Decisão

Usar **PostgreSQL 17** como base de dados e **Prisma 7** como ORM e ferramenta de migrações.

## Justificação

| Requisito | Como o PostgreSQL + Prisma responde |
|---|---|
| Isolamento entre tenants | FKs compostas `(companyId, accountingFirmId)` → `Company(id, accountingFirmId)`: o próprio banco rejeita uma análise que aponte para a empresa de outro escritório. Row-Level Security fica disponível como endurecimento futuro. |
| Integridade relacional | Chaves estrangeiras, unicidade `(accountingFirmId, cnpj)` e transações ACID (confirmação de importação em lote é tudo-ou-nada). |
| Valores monetários | Tipo `NUMERIC` (`Decimal(15,2)` no Prisma), sem erros de vírgula flutuante. |
| Regras versionadas | `CHECK (validUntil > validFrom)` e `EXCLUDE` com intervalos de datas impedem duas versões vigentes da mesma regra no mesmo período. |
| Dados semiestruturados | `JSONB` para `parameters` das versões de regra, `inputSnapshot` e `trace` das análises: flexibilidade onde é necessária, sem abdicar do modelo relacional no resto. |
| Esquema versionado | Prisma Migrate gera migrações SQL versionadas no repositório; restrições que o Prisma não expressa (`CHECK`, `EXCLUDE`) entram como SQL manual na própria migração. |
| Produtividade | O `schema.prisma` gera tipos TypeScript usados pelo backend NestJS, o que detecta erros de consulta em tempo de compilação. |

## Alternativas consideradas

- **MongoDB (Mongoose ou driver oficial).** Válido pelas regras, mas não tem FKs: o isolamento entre tenants e a consistência entre empresas, análises e regras dependeriam apenas do código da aplicação. Também não oferece um equivalente direto a `EXCLUDE` para impedir sobreposição de vigências. O único ponto semiestruturado (snapshots e parâmetros) já é coberto pelo `JSONB`.
- **Drizzle ORM (com PostgreSQL).** Mais leve e próximo do SQL, mas o Prisma traz geração de migrações, seed e cliente tipado mais maduros, o que reduz trabalho num projeto individual de 8 semanas.
- **SQL puro ou query builder (Knex).** Controlo total, mas sem tipos gerados a partir do esquema e com mais código repetitivo.

## Consequências

- **Positivas:** integridade garantida em duas camadas (aplicação e banco); os testes e2e usam PostgreSQL real no CI, provando o isolamento entre tenants; migrações revisáveis nos PRs.
- **Negativas:** o Prisma é uma camada de abstração a mais e não expressa todas as restrições do PostgreSQL, por isso algumas migrações terão SQL escrito à mão. O runtime do Prisma 7 usa `import()` dinâmico, o que obriga os testes e2e do Jest a correr com `--experimental-vm-modules`.
- **Versões:** Prisma 7.10 (não a 8.0, que era RC no npm à data) e PostgreSQL 17 (imagem `postgres:17-alpine`), iguais no Docker Compose e no CI.
