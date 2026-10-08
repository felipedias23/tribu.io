import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/teste' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('formata HttpException com status, erro, mensagem e caminho', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('Empresa não encontrada.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Empresa não encontrada.',
        path: '/api/v1/teste',
        timestamp: expect.any(String),
      }),
    );
  });

  it('preserva os detalhes por campo dos erros de validação', () => {
    const { host, json } = createHost();
    const details = [{ field: 'email', messages: ['inválido'] }];

    filter.catch(
      new BadRequestException({ message: 'Dados inválidos.', details }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Dados inválidos.',
        details,
      }),
    );
  });

  it('não expõe detalhes de erros inesperados', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('senha do banco: segredo'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Erro interno. Tente novamente mais tarde.');
    expect(JSON.stringify(body)).not.toContain('segredo');
  });

  describe('log de erros 5xx (regra S21)', () => {
    const PRISMA_MESSAGE =
      'Invalid `prisma.taxProfile.upsert()` invocation: revenue12m: "987654.32"';

    function loggedText(exception: unknown): string {
      const log = jest.spyOn(Logger.prototype, 'error');
      log.mockClear();
      filter.catch(exception, createHost().host);
      expect(log).toHaveBeenCalledTimes(1);
      return String(log.mock.calls[0][0]);
    }

    it('regista o nome e o código de um erro conhecido do Prisma, sem a mensagem', () => {
      const text = loggedText(
        new Prisma.PrismaClientKnownRequestError(PRISMA_MESSAGE, {
          code: 'P2010',
          clientVersion: 'teste',
        }),
      );

      expect(text).toContain('PrismaClientKnownRequestError');
      expect(text).toContain('P2010');
      expect(text).toContain('at ');
      expect(text).not.toContain('987654.32');
    });

    it('não regista os argumentos da query num erro de validação do Prisma', () => {
      const text = loggedText(
        new Prisma.PrismaClientValidationError(PRISMA_MESSAGE, {
          clientVersion: 'teste',
        }),
      );

      expect(text).toContain('PrismaClientValidationError');
      expect(text).not.toContain('987654.32');
    });

    it('mantém o stack completo dos outros erros', () => {
      const text = loggedText(new Error('falha no serviço X'));

      expect(text).toContain('falha no serviço X');
      expect(text).toContain('at ');
    });

    it('não regista erros 4xx', () => {
      const log = jest.spyOn(Logger.prototype, 'error');
      log.mockClear();

      filter.catch(
        new NotFoundException('Empresa não encontrada.'),
        createHost().host,
      );

      expect(log).not.toHaveBeenCalled();
    });
  });
});
