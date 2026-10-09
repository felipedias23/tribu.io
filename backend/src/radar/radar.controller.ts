import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { TenantId } from '../auth/authenticated-user';
import { CurrentTenant } from '../auth/decorators/current-user.decorator';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ErrorResponseDto } from '../common/errors/error-response';
import { ListRadarQuery } from './dto/list-radar.query';
import { RadarPageResponse, RadarSummaryResponse } from './dto/radar.response';
import { RadarService } from './radar.service';

/** Só leitura, para todos os papéis (D27). */
@ApiTags('radar')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('radar')
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  @Get()
  @ApiOperation({
    summary: 'Carteira classificada pelo Tax Radar, por prioridade',
    description:
      'Estado calculado no pedido (D26), com os motivos de cada sinal. Ordenado pela pontuação de prioridade (D30) e pela razão social.',
  })
  @ApiOkResponse({ type: RadarPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @CurrentTenant() tenantId: TenantId,
    @Query() query: ListRadarQuery,
  ): Promise<RadarPageResponse> {
    return this.radar.list(tenantId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Contagem das empresas por estado do Radar' })
  @ApiOkResponse({ type: RadarSummaryResponse })
  summary(@CurrentTenant() tenantId: TenantId): Promise<RadarSummaryResponse> {
    return this.radar.summary(tenantId);
  }
}
