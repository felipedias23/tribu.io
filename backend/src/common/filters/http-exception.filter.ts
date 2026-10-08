import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { ErrorResponseDto, FieldErrorDto } from '../errors/error-response';

const INTERNAL_ERROR_MESSAGE = 'Erro interno. Tente novamente mais tarde.';

/** Erros do Prisma: a mensagem inclui os argumentos da query (valores do tenant). */
const PRISMA_ERRORS = [
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
];

/**
 * Texto do log de um erro 5xx (regra S21). Nos erros do Prisma, regista o nome,
 * o código e as linhas do stack, nunca a mensagem, que traz os valores da query.
 */
export function describeForLog(exception: unknown): string {
  if (!(exception instanceof Error)) return String(exception);
  if (!PRISMA_ERRORS.some((type) => exception instanceof type)) {
    return exception.stack ?? exception.message;
  }

  const { code, errorCode } = exception as {
    code?: string;
    errorCode?: string;
  };
  const frames = (exception.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return [
    `${exception.name} (código: ${code ?? errorCode ?? 'n/d'})`,
    ...frames,
  ].join('\n');
}

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

    const body = this.toErrorResponse(exception, request.originalUrl);
    if (body.statusCode >= 500) {
      this.logger.error(describeForLog(exception));
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
