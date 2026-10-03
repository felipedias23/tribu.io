import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { CompaniesService } from './companies.service';
import { CompanyPageResponse, CompanyResponse } from './dto/company.response';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQuery } from './dto/list-companies.query';
import { UpdateCompanyDto } from './dto/update-company.dto';

/** Leitura para todos os papéis; escrita para ADMIN e ANALYST (decisão D20). */
@ApiTags('companies')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista e pesquisa as empresas do escritório' })
  @ApiOkResponse({ type: CompanyPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @CurrentTenant() tenantId: TenantId,
    @Query() query: ListCompaniesQuery,
  ): Promise<CompanyPageResponse> {
    return this.companies.list(tenantId, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.ANALYST)
  @ApiOperation({ summary: 'Cadastra uma empresa (ADMIN, ANALYST)' })
  @ApiCreatedResponse({ type: CompanyResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'CNPJ já cadastrado no escritório.',
  })
  create(
    @CurrentTenant() tenantId: TenantId,
    @Body() dto: CreateCompanyDto,
  ): Promise<CompanyResponse> {
    return this.companies.create(tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dados de uma empresa do escritório' })
  @ApiOkResponse({ type: CompanyResponse })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Empresa inexistente ou de outro escritório.',
  })
  findOne(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyResponse> {
    return this.companies.findOwnedOrThrow(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ANALYST)
  @ApiOperation({ summary: 'Altera uma empresa (ADMIN, ANALYST)' })
  @ApiOkResponse({ type: CompanyResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Empresa inexistente ou de outro escritório.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'CNPJ já cadastrado no escritório.',
  })
  update(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyResponse> {
    return this.companies.update(tenantId, id, dto);
  }
}
