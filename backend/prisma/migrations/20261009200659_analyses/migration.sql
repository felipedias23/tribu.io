-- CreateEnum
CREATE TYPE "analysis_status" AS ENUM ('COMPLETED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "radar_status" AS ENUM ('DADOS_INCOMPLETOS', 'REVISAR_REGRA', 'REQUER_ANALISE', 'OPORTUNIDADE_PARA_AVALIAR', 'NORMAL');

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "executed_by_id" UUID NOT NULL,
    "tax_rule_version_id" UUID,
    "input_snapshot" JSONB NOT NULL,
    "parameters_checksum" CHAR(64),
    "engine_version" TEXT NOT NULL,
    "status" "analysis_status" NOT NULL,
    "radar_status" "radar_status" NOT NULL,
    "result" JSONB,
    "trace" JSONB NOT NULL,
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analyses_accounting_firm_id_company_id_executed_at_idx" ON "analyses"("accounting_firm_id", "company_id", "executed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_id_accounting_firm_id_key" ON "users"("id", "accounting_firm_id");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_company_id_accounting_firm_id_fkey" FOREIGN KEY ("company_id", "accounting_firm_id") REFERENCES "companies"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_executed_by_id_accounting_firm_id_fkey" FOREIGN KEY ("executed_by_id", "accounting_firm_id") REFERENCES "users"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_tax_rule_version_id_fkey" FOREIGN KEY ("tax_rule_version_id") REFERENCES "tax_rule_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── Restrições escritas à mão (o Prisma não expressa CHECK nem triggers) ───

-- COMPLETED tem versão, checksum e resultado; INCOMPLETE não tem resultado
-- e pode não ter versão (sem mês de referência ou sem versão vigente, D31).
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_status_content_check"
    CHECK (
        ("status" = 'COMPLETED' AND "tax_rule_version_id" IS NOT NULL AND "result" IS NOT NULL)
        OR ("status" = 'INCOMPLETE' AND "result" IS NULL)
    );

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_version_checksum_check"
    CHECK (("tax_rule_version_id" IS NULL) = ("parameters_checksum" IS NULL));

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_parameters_checksum_format_check"
    CHECK ("parameters_checksum" ~ '^[0-9a-f]{64}$');

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_engine_version_format_check"
    CHECK ("engine_version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_json_objects_check"
    CHECK (
        jsonb_typeof("input_snapshot") = 'object'
        AND jsonb_typeof("trace") = 'object'
        AND ("result" IS NULL OR jsonb_typeof("result") = 'object')
    );

-- O checksum gravado é o da versão usada: a análise prova com que parâmetros
-- foi calculada (§3.4). Uma análise não muda depois de gravada; apagar fica
-- permitido para a remoção de um escritório.
CREATE FUNCTION "analyses_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'analyses: uma análise é imutável; execute uma nova';
    END IF;
    IF NEW."tax_rule_version_id" IS NOT NULL AND NEW."parameters_checksum" IS DISTINCT FROM
        (SELECT "checksum" FROM "tax_rule_versions" WHERE "id" = NEW."tax_rule_version_id")
    THEN
        RAISE EXCEPTION 'analyses: o checksum não é o da versão da regra usada';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "analyses_guard"
    BEFORE INSERT OR UPDATE ON "analyses"
    FOR EACH ROW EXECUTE FUNCTION "analyses_guard"();
