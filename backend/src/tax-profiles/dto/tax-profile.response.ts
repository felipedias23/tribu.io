import { ApiProperty } from '@nestjs/swagger';
import { TaxRegime } from '../../generated/prisma/enums';

/** Campos null são dados ausentes. `updatedAt` null: o perfil ainda não existe. */
export class TaxProfileResponse {
  @ApiProperty({ enum: TaxRegime, enumName: 'TaxRegime', nullable: true })
  taxRegime: TaxRegime | null;

  @ApiProperty({ example: '6201501', type: String, nullable: true })
  cnae: string | null;

  @ApiProperty({ example: 'São Paulo', type: String, nullable: true })
  city: string | null;

  @ApiProperty({ example: 'SP', type: String, nullable: true })
  state: string | null;

  @ApiProperty({ example: '1200000.00', type: String, nullable: true })
  revenue12m: string | null;

  @ApiProperty({ example: '360000.00', type: String, nullable: true })
  payroll12m: string | null;

  @ApiProperty({ example: '2026-09', type: String, nullable: true })
  referencePeriod: string | null;

  @ApiProperty({ type: Date, nullable: true })
  updatedAt: Date | null;
}
