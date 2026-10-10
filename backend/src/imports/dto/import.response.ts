import { ApiProperty } from '@nestjs/swagger';

const STATUSES = ['PREVIEW', 'CONFIRMED', 'CANCELLED', 'EXPIRED'] as const;

export class ImportSummaryCountsResponse {
  @ApiProperty() total: number;
  @ApiProperty() new: number;
  @ApiProperty() updated: number;
  @ApiProperty() unchanged: number;
  @ApiProperty() conflict: number;
  @ApiProperty() error: number;
  @ApiProperty({
    type: [String],
    description: 'Colunas do ficheiro fora do modelo.',
  })
  ignoredColumns: string[];
}

export class ImportUserResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class ImportBatchSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: STATUSES }) status: (typeof STATUSES)[number];
  @ApiProperty({ example: 'carteira.xlsx' }) fileName: string;
  @ApiProperty({ enum: ['CSV', 'XLSX'] }) fileFormat: string;
  @ApiProperty({ example: 'Sistema contábil X' }) origin: string;
  @ApiProperty({ type: ImportSummaryCountsResponse })
  summary: ImportSummaryCountsResponse;
  @ApiProperty({ type: ImportUserResponse }) createdBy: ImportUserResponse;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ description: 'Fim da validade da prévia (D37).' })
  expiresAt: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt: Date | null;
  @ApiProperty({
    type: ImportUserResponse,
    nullable: true,
    description: 'Quem confirmou ou cancelou.',
  })
  closedBy: ImportUserResponse | null;
}

export class ImportRowChangeResponse {
  @ApiProperty({ example: 'payroll12m' }) field: string;
  @ApiProperty({
    nullable: true,
    oneOf: [{ type: 'string' }, { type: 'boolean' }],
  })
  before: string | boolean | null;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'boolean' }] }) after:
    string | boolean;
}

export class ImportRowErrorResponse {
  @ApiProperty({ example: 'receita_12m' }) column: string;
  @ApiProperty() message: string;
}

export class ImportRowResponse {
  @ApiProperty({ description: 'Linha do ficheiro (o cabeçalho é a 1).' })
  line: number;
  @ApiProperty({ enum: ['NEW', 'UPDATED', 'UNCHANGED', 'CONFLICT', 'ERROR'] })
  outcome: string;
  @ApiProperty({ type: String, nullable: true }) cnpj: string | null;
  @ApiProperty({ type: String, nullable: true }) legalName: string | null;
  @ApiProperty({ type: String, nullable: true }) externalId: string | null;
  @ApiProperty({ type: String, nullable: true }) companyId: string | null;
  @ApiProperty({ type: [ImportRowChangeResponse] })
  changes: ImportRowChangeResponse[];
  @ApiProperty({ type: [ImportRowErrorResponse] })
  errors: ImportRowErrorResponse[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo do conflito.',
  })
  reason: string | null;
}

export class ImportBatchResponse extends ImportBatchSummaryResponse {
  @ApiProperty({
    type: [ImportRowResponse],
    nullable: true,
    description:
      'Linhas da prévia; null depois de confirmar, cancelar ou expirar (D37).',
  })
  rows: ImportRowResponse[] | null;
}

export class ImportBatchPageResponse {
  @ApiProperty({ type: [ImportBatchSummaryResponse] })
  items: ImportBatchSummaryResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
