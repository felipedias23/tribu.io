import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser, TenantId } from '../auth/authenticated-user';
import {
  CurrentTenant,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ErrorResponseDto } from '../common/errors/error-response';
import { Role } from '../generated/prisma/enums';
import { AnalysesService } from './analyses.service';
import {
  AnalysisPageResponse,
  AnalysisResponse,
} from './dto/analysis.response';
import { ListAnalysesQuery } from './dto/list-analyses.query';

/** Executar: ADMIN e ANALYST; consultar: todos os papéis (D27). */
@ApiTags('analyses')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller()
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post('companies/:id/analyses')
  @Roles(Role.ADMIN, Role.ANALYST)
  @ApiOperation({
    summary: 'Executa a análise do Fator R da empresa (ADMIN, ANALYST)',
    description:
      'Grava uma análise imutável. Sem dados ou sem versão vigente, fica INCOMPLETE com o motivo (D31).',
  })
  @ApiCreatedResponse({ type: AnalysisResponse })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Empresa inexistente ou de outro escritório.',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'Empresa fora do Simples Nacional: a regra não se aplica.',
  })
  execute(
    @CurrentTenant() tenantId: TenantId,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) companyId: string,
  ): Promise<AnalysisResponse> {
    return this.analyses.execute(tenantId, user, companyId);
  }

  @Get('companies/:id/analyses')
  @ApiOperation({ summary: 'Histórico de análises da empresa (US15)' })
  @ApiOkResponse({ type: AnalysisPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Empresa inexistente ou de outro escritório.',
  })
  list(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query() query: ListAnalysesQuery,
  ): Promise<AnalysisPageResponse> {
    return this.analyses.list(tenantId, companyId, query);
  }

  @Get('analyses/:id')
  @ApiOperation({
    summary: 'Uma análise, com a entrada, a regra e o raciocínio (US11)',
  })
  @ApiOkResponse({ type: AnalysisResponse })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Análise inexistente ou de outro escritório.',
  })
  findOne(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AnalysisResponse> {
    return this.analyses.findOwnedOrThrow(tenantId, id);
  }
}
