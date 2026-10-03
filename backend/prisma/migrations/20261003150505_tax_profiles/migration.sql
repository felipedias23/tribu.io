-- CreateEnum
CREATE TYPE "tax_regime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- CreateTable
CREATE TABLE "tax_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tax_regime" "tax_regime",
    "cnae" CHAR(7),
    "city" TEXT,
    "state" CHAR(2),
    "revenue_12m" DECIMAL(15,2),
    "payroll_12m" DECIMAL(15,2),
    "reference_period" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_profiles_accounting_firm_id_idx" ON "tax_profiles"("accounting_firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_company_id_accounting_firm_id_key" ON "tax_profiles"("company_id", "accounting_firm_id");

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_company_id_accounting_firm_id_fkey" FOREIGN KEY ("company_id", "accounting_firm_id") REFERENCES "companies"("id", "accounting_firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Restrições escritas à mão (o Prisma não expressa CHECK) ───
-- Todos os campos tributários aceitam NULL (dado ausente, decisão D20); as
-- restrições só se aplicam quando há valor.

ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_cnae_format_check"
    CHECK ("cnae" ~ '^[0-9]{7}$');

ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_city_not_blank_check"
    CHECK (btrim("city") <> '');

ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_state_check"
    CHECK ("state" IN ('AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
                       'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
                       'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'));

ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_revenue_12m_non_negative_check"
    CHECK ("revenue_12m" >= 0);

ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_payroll_12m_non_negative_check"
    CHECK ("payroll_12m" >= 0);

-- O período de referência é um mês: guarda-se sempre o 1.º dia.
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_reference_period_month_check"
    CHECK (EXTRACT(DAY FROM "reference_period") = 1);
