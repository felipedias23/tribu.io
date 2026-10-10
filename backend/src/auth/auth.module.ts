import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  API_RATE_LIMIT,
  RATE_LIMIT_TTL_MS,
} from './decorators/strict-throttle.decorator';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SESSION_TTL_SECONDS } from './session-cookie';
import { SessionService } from './session.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS },
        // Algoritmo fixo: rejeita tokens `none` ou assinados com outro algoritmo.
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Rate limit por IP em cada rota (D44); o login, o registo e a prévia da
    // importação baixam-no com @StrictThrottle().
    ThrottlerModule.forRoot([
      { ttl: RATE_LIMIT_TTL_MS, limit: API_RATE_LIMIT },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    // Ordem importa: primeiro o rate limit, para que um pedido em excesso não
    // chegue a ler a sessão no banco; depois autentica; por fim, o papel.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
