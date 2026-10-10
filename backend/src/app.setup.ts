import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import type { Env } from './config/env.validation';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/** Configuração global partilhada por main.ts e pelos testes e2e. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  // O nginx fica à frente da API: o IP do cliente, usado pelo rate limiting,
  // é o que ele acrescenta ao X-Forwarded-For. Confiar num número exato de
  // proxies impede que o cliente falsifique o IP enviando o próprio cabeçalho.
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  // Cabeçalhos de segurança (CSP, nosniff, frame-ancestors, HSTS…). Os
  // padrões do helmet servem à API e ao Swagger UI, que não usa scripts inline.
  // Sem HTTPS (ambiente local), o browser não pode ser mandado para https://.
  const https = config.get('COOKIE_SECURE', { infer: true });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: https ? [] : null },
      },
    }),
  );
  app.use(cookieParser());
  // O ficheiro da importação vai em base64 dentro de JSON (D35): só esta rota
  // aceita um corpo até 3 MB; as outras mantêm o limite padrão de 100 KB. O
  // parser fica dentro de uma função: o Nest não regista o seu parser global
  // se já existir uma camada chamada "jsonParser".
  const importsJson = json({ limit: '3mb' });
  app.use(
    `/${API_PREFIX}/imports`,
    (req: Request, res: Response, next: NextFunction) =>
      importsJson(req, res, next),
  );

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
