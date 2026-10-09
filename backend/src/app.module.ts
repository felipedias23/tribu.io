import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { JsonOnlyMiddleware } from './common/middleware/json-only.middleware';
import { CompaniesModule } from './companies/companies.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RadarModule } from './radar/radar.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Desenvolvimento local: .env da raiz do monorepo. Não sobrescreve
      // variáveis já definidas no ambiente (containers/CI).
      envFilePath: ['../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    TaxProfilesModule,
    RadarModule,
    AnalysesModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JsonOnlyMiddleware).forRoutes('*path');
  }
}
