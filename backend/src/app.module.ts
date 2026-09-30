import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Desenvolvimento local: .env da raiz do monorepo. Não sobrescreve
      // variáveis já definidas no ambiente (containers/CI).
      envFilePath: ['../.env'],
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
