import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { SESSION_TTL_SECONDS } from './session-cookie';
import { SessionService } from './session.service';

/** Tentativas de login ou registo por IP, por minuto. */
export const AUTH_RATE_LIMIT = 10;

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
    // Brute force e credential stuffing: por IP, só no login e no registo.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: AUTH_RATE_LIMIT }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
