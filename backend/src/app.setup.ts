import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/** Configuração global partilhada por main.ts e pelos testes e2e. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  // O nginx (rede privada do Docker) fica à frente da API: o IP real do
  // cliente, usado pelo rate limiting, vem de X-Forwarded-For. Só se confia
  // no cabeçalho quando o pedido chega de um endereço local ou privado.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(cookieParser());

  // Sem CORS: o frontend acede à API pela mesma origem (proxy nginx/Vite).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tribu.io API')
      .setDescription(
        'API REST do Tribu.io — inteligência tributária para escritórios de contabilidade.',
      )
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document);
}
