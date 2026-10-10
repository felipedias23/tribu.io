import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
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
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedUser, TenantId } from '../auth/authenticated-user';
import {
  CurrentTenant,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ErrorResponseDto } from '../common/errors/error-response';
import { Role } from '../generated/prisma/enums';
import { CreateImportDto } from './dto/create-import.dto';
import {
  ImportBatchPageResponse,
  ImportBatchResponse,
} from './dto/import.response';
import { ListImportsQuery } from './dto/list-imports.query';
import { ImportsService } from './imports.service';

/** Importar, confirmar e cancelar: ADMIN e ANALYST; consultar: todos (D34). */
@ApiTags('imports')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.ANALYST)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Lê um ficheiro CSV ou XLSX e devolve a prévia (ADMIN, ANALYST)',
    description:
      'Nada é gravado na carteira até à confirmação. A prévia vale 24 horas (D37).',
  })
  @ApiCreatedResponse({ type: ImportBatchResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'Ficheiro inválido: formato, tamanho, cabeçalho (D35).',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  preview(
    @CurrentTenant() tenantId: TenantId,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateImportDto,
  ): Promise<ImportBatchResponse> {
    return this.imports.preview(tenantId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de importações do escritório (US13)' })
  @ApiOkResponse({ type: ImportBatchPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @CurrentTenant() tenantId: TenantId,
    @Query() query: ListImportsQuery,
  ): Promise<ImportBatchPageResponse> {
    return this.imports.list(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Uma importação, com as linhas se for prévia' })
  @ApiOkResponse({ type: ImportBatchResponse })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @CurrentTenant() tenantId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportBatchResponse> {
    return this.imports.findOwnedOrThrow(tenantId, id);
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN, Role.ANALYST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirma a prévia (ADMIN, ANALYST)',
    description:
      'Numa transação, volta a classificar as linhas: se a carteira mudou, responde 409 e nada é aplicado (D37).',
  })
  @ApiOkResponse({ type: ImportBatchResponse })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Prévia já fechada, expirada, ou carteira alterada.',
  })
  confirm(
    @CurrentTenant() tenantId: TenantId,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportBatchResponse> {
    return this.imports.confirm(tenantId, user, id);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.ANALYST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela a prévia (ADMIN, ANALYST)' })
  @ApiOkResponse({ type: ImportBatchResponse })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(
    @CurrentTenant() tenantId: TenantId,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportBatchResponse> {
    return this.imports.cancel(tenantId, user, id);
  }
}
