-- Atividade sujeita ao Fator R (D33). NULL = não informado (D20): os perfis
-- existentes ficam por confirmar pelo contador; o sistema não presume "sim".
-- AlterTable
ALTER TABLE "tax_profiles" ADD COLUMN     "fator_r_subject" BOOLEAN;
