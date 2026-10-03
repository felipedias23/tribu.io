-- Ordenação alfabética em português: maiúsculas, minúsculas e acentos ficam
-- juntos (a collation do banco ordena pelo valor binário). Vale para a
-- listagem de empresas e para o índice (accounting_firm_id, legal_name), que o
-- PostgreSQL reconstrói. O Prisma não expressa collation no schema.
ALTER TABLE "companies" ALTER COLUMN "legal_name" TYPE TEXT COLLATE "pt-BR-x-icu";
