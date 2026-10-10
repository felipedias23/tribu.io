-- CreateEnum
CREATE TYPE "integration_type" AS ENUM ('FILE');

-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "type" "integration_type" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_company_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_company_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "import_batch_status" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_format" TEXT NOT NULL,
    "preview" JSONB,
    "summary" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_accounting_firm_id_type_name_key" ON "integrations"("accounting_firm_id", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_id_accounting_firm_id_key" ON "integrations"("id", "accounting_firm_id");

-- CreateIndex
CREATE INDEX "external_company_mappings_accounting_firm_id_idx" ON "external_company_mappings"("accounting_firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_company_mappings_integration_id_external_id_key" ON "external_company_mappings"("integration_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_company_mappings_integration_id_company_id_key" ON "external_company_mappings"("integration_id", "company_id");

-- CreateIndex
CREATE INDEX "import_batches_accounting_firm_id_created_at_idx" ON "import_batches"("accounting_firm_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firms"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_company_mappings" ADD CONSTRAINT "external_company_mappings_integration_id_accounting_firm_i_fkey" FOREIGN KEY ("integration_id", "accounting_firm_id") REFERENCES "integrations"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_company_mappings" ADD CONSTRAINT "external_company_mappings_company_id_accounting_firm_id_fkey" FOREIGN KEY ("company_id", "accounting_firm_id") REFERENCES "companies"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_integration_id_accounting_firm_id_fkey" FOREIGN KEY ("integration_id", "accounting_firm_id") REFERENCES "integrations"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_accounting_firm_id_fkey" FOREIGN KEY ("created_by_id", "accounting_firm_id") REFERENCES "users"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── Restrições escritas à mão (o Prisma não expressa CHECK nem triggers) ───

ALTER TABLE "integrations" ADD CONSTRAINT "integrations_name_not_blank_check"
    CHECK (btrim("name") <> '' AND char_length("name") <= 100);

ALTER TABLE "external_company_mappings" ADD CONSTRAINT "external_company_mappings_external_id_check"
    CHECK (btrim("external_id") <> '' AND char_length("external_id") <= 100);

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_file_name_not_blank_check"
    CHECK (btrim("file_name") <> '' AND char_length("file_name") <= 255);

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_file_format_check"
    CHECK ("file_format" IN ('CSV', 'XLSX'));

-- Só PREVIEW guarda as linhas da prévia e não tem data de fecho (D37).
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_preview_status_check"
    CHECK (("status" = 'PREVIEW') = ("preview" IS NOT NULL));

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_closed_at_status_check"
    CHECK (("status" = 'PREVIEW') = ("closed_at" IS NULL));

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_expires_at_check"
    CHECK ("expires_at" > "created_at");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_json_objects_check"
    CHECK (
        jsonb_typeof("summary") = 'object'
        AND ("preview" IS NULL OR jsonb_typeof("preview") = 'object')
    );

-- Uma importação fechada (confirmada, cancelada ou expirada) não muda: o
-- resumo é o registo do que aconteceu. Apagar fica para a remoção do
-- escritório.
CREATE FUNCTION "import_batches_guard_closed"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" <> 'PREVIEW' THEN
        RAISE EXCEPTION 'import_batches: uma importação fechada não muda';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "import_batches_guard_closed"
    BEFORE UPDATE ON "import_batches"
    FOR EACH ROW EXECUTE FUNCTION "import_batches_guard_closed"();
