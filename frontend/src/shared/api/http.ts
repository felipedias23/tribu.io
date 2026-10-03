/** Prefixo da API REST. Em Docker e no `vite dev` é servido pela mesma origem. */
export const API_BASE_URL = '/api/v1';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Espelha o ErrorResponseDto do backend. */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: FieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: FieldError[];

  constructor(status: number, message: string, details: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Mensagens de validação de um campo, vindas do backend. */
  fieldMessages(field: string): string[] {
    return this.details.find((detail) => detail.field === field)?.messages ?? [];
  }
}

const GENERIC_ERROR = 'Não foi possível comunicar com o servidor.';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Regista quem reage a uma sessão expirada (o AuthProvider). Chamado quando
 * um pedido fora de /auth/* recebe 401. As rotas /auth/* ficam de fora: o 401
 * delas faz parte do fluxo normal (credenciais erradas, /auth/me sem sessão).
 * Devolve a função que remove o registo.
 */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    return new ApiError(response.status, body.message ?? GENERIC_ERROR, body.details);
  } catch {
    return new ApiError(response.status, GENERIC_ERROR);
  }
}

/**
 * Pedido JSON à API. A sessão viaja no cookie httpOnly, enviado pelo browser
 * (mesma origem); o frontend nunca lê nem guarda o token. Lança ApiError em
 * respostas não-2xx.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      unauthorizedHandler?.();
    }
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
