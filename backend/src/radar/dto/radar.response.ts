import { ApiProperty } from '@nestjs/swagger';
import { RADAR_STATUSES, type RadarStatus } from '../radar-classifier';

export class RadarCompanyResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'TRIBUA00000126', description: 'Sem máscara.' })
  cnpj: string;

  @ApiProperty({ example: 'Oficina Exemplo Ltda' })
  legalName: string;

  @ApiProperty({ example: 'Oficina Exemplo', type: String, nullable: true })
  tradeName: string | null;
}

export class RadarReasonResponse {
  @ApiProperty({ example: 'NEAR_THRESHOLD_BELOW' })
  code: string;

  @ApiProperty({
    example:
      'Fator R de 26,00%, a 2,00 p.p. do limiar de 28,00%: com mais folha, a empresa pode passar ao Anexo III.',
  })
  message: string;
}

export class RadarRuleVersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'SIMPLES_FATOR_R@1' })
  evaluatorKey: string;
}

/** Resumo do cálculo, quando ele chegou ao fim. */
export class RadarResultResponse {
  @ApiProperty({
    example: '0.26',
    description: 'Folha ÷ RBT12, precisão completa.',
  })
  fatorR: string;

  @ApiProperty({ enum: ['III', 'V'] })
  annex: 'III' | 'V';

  @ApiProperty({ example: 4, minimum: 1, maximum: 6 })
  bracket: number;

  @ApiProperty({ example: '0.1303', description: 'Fração, 4 casas.' })
  effectiveRate: string;
}

export class RadarLastAnalysisResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['COMPLETED', 'INCOMPLETE'] })
  status: 'COMPLETED' | 'INCOMPLETE';

  @ApiProperty()
  executedAt: Date;
}

export class RadarItemResponse {
  @ApiProperty({ type: RadarCompanyResponse })
  company: RadarCompanyResponse;

  @ApiProperty({ enum: RADAR_STATUSES })
  status: RadarStatus;

  @ApiProperty({
    example: 3979,
    description: 'Peso do estado × 1000 + desempate (D30).',
  })
  priorityScore: number;

  @ApiProperty({ type: [RadarReasonResponse] })
  reasons: RadarReasonResponse[];

  @ApiProperty({ type: RadarRuleVersionResponse, nullable: true })
  ruleVersion: RadarRuleVersionResponse | null;

  @ApiProperty({
    type: RadarLastAnalysisResponse,
    nullable: true,
    description: 'Última análise da empresa; null se nunca foi analisada.',
  })
  lastAnalysis: RadarLastAnalysisResponse | null;

  @ApiProperty({ type: RadarResultResponse, nullable: true })
  result: RadarResultResponse | null;
}

export class RadarPageResponse {
  @ApiProperty({ type: [RadarItemResponse] })
  items: RadarItemResponse[];

  @ApiProperty({ example: 30 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}

export class RadarCountsResponse {
  @ApiProperty() DADOS_INCOMPLETOS: number;
  @ApiProperty() REVISAR_REGRA: number;
  @ApiProperty() REQUER_ANALISE: number;
  @ApiProperty() OPORTUNIDADE_PARA_AVALIAR: number;
  @ApiProperty() NORMAL: number;
}

export class RadarSummaryResponse {
  @ApiProperty({ example: 30 })
  total: number;

  @ApiProperty({ type: RadarCountsResponse })
  counts: RadarCountsResponse;
}
