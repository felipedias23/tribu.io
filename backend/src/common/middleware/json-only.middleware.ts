import {
  Injectable,
  NestMiddleware,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * A API só aceita corpos em JSON. Um formulário HTML de outro site envia
 * `application/x-www-form-urlencoded` sem preflight de CORS; recusá-lo junta
 * uma defesa contra CSRF ao cookie `SameSite=Strict`. Pedidos sem corpo ou
 * com corpo vazio (ex.: `POST /auth/logout`) passam.
 */
@Injectable()
export class JsonOnlyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const hasBody =
      request.headers['transfer-encoding'] !== undefined ||
      Number(request.headers['content-length'] ?? 0) > 0;
    if (hasBody && !request.is('application/json')) {
      throw new UnsupportedMediaTypeException(
        'Envie os dados em JSON (Content-Type: application/json).',
      );
    }
    next();
  }
}
