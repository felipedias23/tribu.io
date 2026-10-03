import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'tribu_session';

/** Duração da sessão, sem refresh token (decisão D7). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * httpOnly: inacessível a JavaScript (XSS). SameSite=Strict: não é enviado em
 * pedidos de outros sites (CSRF). Path=/api: só vai para a API.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/api',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function readSessionCookie(request: Request): string | undefined {
  const value: unknown = (request.cookies as Record<string, unknown>)?.[
    SESSION_COOKIE
  ];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
