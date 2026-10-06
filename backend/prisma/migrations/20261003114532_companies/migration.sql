-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "cnpj" CHAR(14) NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_accounting_firm_id_legal_name_idx" ON "companies"("accounting_firm_id", "legal_name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_accounting_firm_id_cnpj_key" ON "companies"("accounting_firm_id", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "companies_id_accounting_firm_id_key" ON "companies"("id", "accounting_firm_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firms"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Restrições escritas à mão (o Prisma não expressa CHECK) ───

-- CNPJ sem pontuação: 12 caracteres alfanuméricos + 2 dígitos verificadores
-- (IN RFB 2.229/2024). O cálculo dos dígitos verificadores é validado na
-- aplicação.
ALTER TABLE "companies" ADD CONSTRAINT "companies_cnpj_format_check"
    CHECK ("cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$');

ALTER TABLE "companies" ADD CONSTRAINT "companies_legal_name_not_blank_check"
    CHECK (btrim("legal_name") <> '');

-- Sem nome fantasia, o valor é NULL, nunca texto vazio.
ALTER TABLE "companies" ADD CONSTRAINT "companies_trade_name_not_blank_check"
    CHECK ("trade_name" IS NULL OR btrim("trade_name") <> '');
