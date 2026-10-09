import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Leitura do catálogo global de regras (só leitura, regra S11). */
@Injectable()
export class TaxRulesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Versões publicadas de uma regra, com o necessário para escolher e calcular. */
  publishedVersions(code: string) {
    return this.prisma.taxRuleVersion.findMany({
      where: { taxRule: { code }, status: 'PUBLISHED' },
      select: {
        id: true,
        version: true,
        evaluatorKey: true,
        parameters: true,
        checksum: true,
        status: true,
        validFrom: true,
        validUntil: true,
      },
    });
  }
}
