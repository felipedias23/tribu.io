import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { TenantId } from '../auth/authenticated-user';
import { CurrentTenant } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ErrorResponseDto } from '../common/errors/error-response';
import { Role } from '../generated/prisma/enums';
import { PutTaxProfileDto } from './dto/put-tax-profile.dto';
import { TaxProfileResponse } from './dto/tax-profile.response';
import { TaxProfilesService } from './tax-profiles.service';

/** Leitura para todos os papéis; escrita para ADMIN e ANALYST (decisão D20). */
@ApiTags('tax-profiles')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  type: ErrorResponseDto,
  description: 'Empresa inexistente ou de outro escritório.',
})
@Controller('companies/:id/tax-profile')
export class TaxProfilesController {
  constructor(private readonly taxProfiles: TaxProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'Perfil tributário da empresa (campos null são dados ausentes)',
  })
  @ApiOkResponse({ type: TaxProfileResponse })
  get(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) companyId: string,
  ): Promise<TaxProfileResponse> {
    return this.taxProfiles.get(tenantId, companyId);
  }

  @Put()
  @Roles(Role.ADMIN, Role.ANALYST)
  @ApiOperation({
    summary: 'Cria ou substitui o perfil tributário (ADMIN, ANALYST)',
  })
  @ApiOkResponse({ type: TaxProfileResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  put(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) companyId: string,
    @Body() dto: PutTaxProfileDto,
  ): Promise<TaxProfileResponse> {
    return this.taxProfiles.put(tenantId, companyId, dto);
  }
}
