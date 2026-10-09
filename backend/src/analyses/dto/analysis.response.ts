import { ApiProperty } from '@nestjs/swagger';
import { RADAR_STATUSES, type RadarStatus } from '../../radar/radar-classifier';

const ANALYSIS_STATUSES = ['COMPLETED', 'INCOMPLETE'] as const;
type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export class AnalysisUserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Analista Alfa' })
  name: string;
}

/** Regra e versão usadas, para a explicação (US11, D30). */
export class AnalysisRuleVersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SIMPLES_FATOR_R' })
  ruleCode: string;

  @ApiProperty({ example: 'Simples Nacional: Fator R (Anexo III ou V)' })
  ruleName: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'SIMPLES_FATOR_R@1' })
  evaluatorKey: string;

  @ApiProperty({ example: '2018-01-01' })
  validFrom: string;

  @ApiProperty({
    example: null,
    type: String,
    nullable: true,
    description: 'Exclusivo; null = sem fim.',
  })
  validUntil: string | null;

  @ApiProperty({ example: 'LC 123/2006, art. 18 …' })
  source: string;
}

export class AnalysisSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty({ enum: ANALYSIS_STATUSES })
  status: AnalysisStatus;

  @ApiProperty({
    enum: RADAR_STATUSES,
    description: 'Estado do Radar no momento da execução (histórico, D26).',
  })
  radarStatus: RadarStatus;

  @ApiProperty()
  executedAt: Date;

  @ApiProperty({ type: AnalysisUserResponse })
  executedBy: AnalysisUserResponse;

  @ApiProperty({ type: AnalysisRuleVersionResponse, nullable: true })
  ruleVersion: AnalysisRuleVersionResponse | null;

  @ApiProperty({
    description:
      'Resultado do cálculo (Fator R, anexo, faixa, alíquotas); null em INCOMPLETE.',
    nullable: true,
    type: Object,
  })
  result: unknown;
}

export class AnalysisResponse extends AnalysisSummaryResponse {
  @ApiProperty({ example: '1.0.0' })
  engineVersion: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SHA-256 dos parâmetros da versão usada.',
  })
  parametersChecksum: string | null;

  @ApiProperty({
    description: 'Perfil usado no cálculo (snapshot), decimais em texto.',
    type: Object,
  })
  input: unknown;

  @ApiProperty({
    description:
      'Raciocínio: outcome, steps, missing, assumptions e reasons (US11).',
    type: Object,
  })
  trace: unknown;
}

export class AnalysisPageResponse {
  @ApiProperty({ type: [AnalysisSummaryResponse] })
  items: AnalysisSummaryResponse[];

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
