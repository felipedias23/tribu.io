import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.validation';
import { AuthGuard } from './guards/auth.guard';
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
  ],
  providers: [SessionService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
