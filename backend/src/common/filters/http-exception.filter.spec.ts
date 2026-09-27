import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/teste' }),
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
});
