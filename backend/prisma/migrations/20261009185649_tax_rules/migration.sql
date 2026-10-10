-- CreateEnum
CREATE TYPE "tax_rule_version_status" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "parameters" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "evaluator_key" TEXT NOT NULL,
    "status" "tax_rule_version_status" NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_code_key" ON "tax_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rule_versions_tax_rule_id_version_key" ON "tax_rule_versions"("tax_rule_id", "version");

-- AddForeignKey
ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_tax_rule_id_fkey" FOREIGN KEY ("tax_rule_id") REFERENCES "tax_rules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Restrições escritas à mão (o Prisma não expressa CHECK, EXCLUDE nem triggers) ───
-- Catálogo global (§3.4): sem accounting_firm_id e sem endpoint de escrita (S11).

ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_code_format_check"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$');

ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_name_not_blank_check"
    CHECK (btrim("name") <> '');

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_version_positive_check"
    CHECK ("version" >= 1);

-- valid_until é exclusivo: o primeiro dia em que a versão já não vale.
ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_validity_check"
    CHECK ("valid_until" > "valid_from");

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_parameters_object_check"
    CHECK (jsonb_typeof("parameters") = 'object');

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_source_not_blank_check"
    CHECK (btrim("source") <> '');

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_evaluator_key_format_check"
    CHECK ("evaluator_key" ~ '^[A-Z][A-Z0-9_]*@[1-9][0-9]*$');

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_checksum_format_check"
    CHECK ("checksum" ~ '^[0-9a-f]{64}$');

-- Só uma versão PUBLISHED de cada regra vale em cada dia. Versões DRAFT e
-- SUPERSEDED podem sobrepor-se. btree_gist permite o "=" do uuid num índice GiST
-- (extensão confiável: não exige superuser).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "tax_rule_versions" ADD CONSTRAINT "tax_rule_versions_published_no_overlap"
    EXCLUDE USING gist (
        "tax_rule_id" WITH =,
        daterange("valid_from", "valid_until", '[)') WITH &&
    ) WHERE ("status" = 'PUBLISHED');

-- Uma versão publicada é imutável (§3.4): as análises guardam o seu id e o
-- checksum. Depois de sair de DRAFT só pode:
--   - passar de PUBLISHED a SUPERSEDED;
--   - receber o fim da vigência (valid_until de NULL para uma data).
-- Também não pode ser apagada. O erro usa o código padrão do RAISE (P0001):
-- com restrict_violation, o Prisma mostraria "Foreign key constraint violated".
CREATE FUNCTION "tax_rule_versions_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" = 'DRAFT' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'tax_rule_versions: versão % não pode ser apagada', OLD."status";
    END IF;
    IF NEW."tax_rule_id" IS DISTINCT FROM OLD."tax_rule_id"
        OR NEW."version" IS DISTINCT FROM OLD."version"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
        OR NEW."parameters" IS DISTINCT FROM OLD."parameters"
        OR NEW."source" IS DISTINCT FROM OLD."source"
        OR NEW."evaluator_key" IS DISTINCT FROM OLD."evaluator_key"
        OR NEW."checksum" IS DISTINCT FROM OLD."checksum"
        OR (OLD."valid_until" IS NOT NULL AND NEW."valid_until" IS DISTINCT FROM OLD."valid_until")
        OR NOT (NEW."status" = OLD."status" OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'SUPERSEDED'))
    THEN
        RAISE EXCEPTION 'tax_rule_versions: versão % é imutável; publique uma versão nova', OLD."status";
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "tax_rule_versions_guard_immutable"
    BEFORE UPDATE OR DELETE ON "tax_rule_versions"
    FOR EACH ROW EXECUTE FUNCTION "tax_rule_versions_guard_immutable"();
