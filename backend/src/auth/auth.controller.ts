import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/errors/error-response';
import type { Env } from '../config/env.validation';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthUserResponse } from './dto/auth-user.response';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session-cookie';

const SESSION_COOKIE_DESCRIPTION = `Define o cookie de sessão \`${SESSION_COOKIE}\` (httpOnly, SameSite=Strict, 8h). O token não é devolvido no corpo.`;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookie = config.get('COOKIE_SECURE', { infer: true });
  }

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Regista um escritório e o seu primeiro utilizador (ADMIN)',
    description: `Inicia sessão automaticamente. ${SESSION_COOKIE_DESCRIPTION}`,
  })
  @ApiCreatedResponse({ type: AuthUserResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Email já registado.',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, token } = await this.auth.register(dto);
    this.setSessionCookie(response, token);
    return user;
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicia sessão com email e password',
    description: SESSION_COOKIE_DESCRIPTION,
  })
  @ApiOkResponse({ type: AuthUserResponse })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Email ou password incorretos.',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, token } = await this.auth.login(dto);
    this.setSessionCookie(response, token);
    return user;
  }

  @Get('me')
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Utilizador da sessão atual' })
  @ApiOkResponse({ type: AuthUserResponse })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserResponse> {
    return this.auth.profile(user.id);
  }

  /** Pública para que o cookie seja apagado mesmo com a sessão já expirada. */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Termina a sessão',
    description:
      'Invalida todas as sessões do utilizador (tokenVersion) e apaga o cookie. Responde 204 mesmo sem sessão válida.',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readSessionCookie(request));
    const { maxAge, ...options } = sessionCookieOptions(this.secureCookie);
    response.clearCookie(SESSION_COOKIE, options);
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(this.secureCookie),
    );
  }
}
