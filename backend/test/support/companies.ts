import { cnpjCheckDigits } from '../../src/companies/cnpj';
import { PrismaClient } from '../../src/generated/prisma/client';

let counter = 0;

/** CNPJ válido e único por execução, com raiz fictícia (começa por TEST). */
export function uniqueCnpj(): string {
  counter += 1;
  const random = Math.floor(Math.random() * 1e4)
    .toString()
    .padStart(4, '0');
  const base = `TEST${random}${counter.toString().padStart(4, '0')}`;
  return `${base}${cnpjCheckDigits(base)}`;
}

/** Cria uma empresa diretamente no banco (sem passar pela API). */
export function createCompany(
  prisma: PrismaClient,
  accountingFirmId: string,
  legalName = 'Empresa de Teste Ltda',
) {
  return prisma.company.create({
    data: { accountingFirmId, cnpj: uniqueCnpj(), legalName },
  });
}
