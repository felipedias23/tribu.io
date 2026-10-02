import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Único ponto de acesso ao banco. A conexão é aberta sob demanda na primeira
 * consulta, para que a API arranque mesmo com o banco temporariamente
 * indisponível (o health check reporta o estado).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
