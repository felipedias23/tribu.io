-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateTable
CREATE TABLE "accounting_firms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "cnpj" CHAR(14),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounting_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accounting_firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_firms_cnpj_key" ON "accounting_firms"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_accounting_firm_id_idx" ON "users"("accounting_firm_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firms"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Restrições escritas à mão (o Prisma não expressa CHECK) ───

-- CNPJ sem pontuação: 12 caracteres alfanuméricos + 2 dígitos verificadores
-- (formato numérico e alfanumérico, IN RFB 2.229/2024). O cálculo dos dígitos
-- verificadores é validado na aplicação.
ALTER TABLE "accounting_firms" ADD CONSTRAINT "accounting_firms_cnpj_format_check"
    CHECK ("cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$');

ALTER TABLE "accounting_firms" ADD CONSTRAINT "accounting_firms_name_not_blank_check"
    CHECK (btrim("name") <> '');

-- O email é guardado em minúsculas, para que a unicidade não dependa de
-- maiúsculas/minúsculas.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check"
    CHECK ("email" = lower("email"));

ALTER TABLE "users" ADD CONSTRAINT "users_name_not_blank_check"
    CHECK (btrim("name") <> '');

ALTER TABLE "users" ADD CONSTRAINT "users_token_version_non_negative_check"
    CHECK ("token_version" >= 0);
