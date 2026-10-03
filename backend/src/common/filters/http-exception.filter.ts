import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorResponseDto, FieldErrorDto } from '../errors/error-response';

const INTERNAL_ERROR_MESSAGE = 'Erro interno. Tente novamente mais tarde.';

/**
 * Converte qualquer exceção no formato ErrorResponseDto.
 * Erros inesperados são registrados no log e nunca expõem detalhes internos.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body = this.toErrorResponse(exception, request.url);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(exception: unknown, path: string): ErrorResponseDto {
    const timestamp = new Date().toISOString();

    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: INTERNAL_ERROR_MESSAGE,
        path,
        timestamp,
      };
    }

    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    const { message, details } =
      typeof payload === 'string'
        ? { message: payload, details: undefined }
        : (payload as {
            message?: string | string[];
            details?: FieldErrorDto[];
          });

    return {
      statusCode,
      error: HttpStatus[statusCode]
        ? this.humanize(HttpStatus[statusCode])
        : 'Error',
      message:
        statusCode >= 500
          ? INTERNAL_ERROR_MESSAGE
          : ((Array.isArray(message) ? message.join('; ') : message) ??
            exception.message),
      ...(details ? { details } : {}),
      path,
      timestamp,
    };
  }

  /** NOT_FOUND → "Not Found" */
  private humanize(statusName: string): string {
    return statusName
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
