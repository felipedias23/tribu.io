import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/**
 * Arranca a aplicação completa, com a mesma configuração global do main.ts.
 * `extra` permite registar módulos só de teste (ex.: controllers de papéis).
 */
export async function createTestApp(
  extra: Pick<ModuleMetadata, 'imports' | 'controllers'> = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
