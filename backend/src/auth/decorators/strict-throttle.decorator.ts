import { Throttle } from '@nestjs/throttler';

/** Janela do rate limit. */
export const RATE_LIMIT_TTL_MS = 60_000;

/** Pedidos por IP, por minuto, em cada rota (D44). */
export const API_RATE_LIMIT = 300;

/** Tentativas por IP, por minuto, no login, no registo e na prévia da importação. */
export const AUTH_RATE_LIMIT = 10;

/**
 * Baixa o rate limit da rota para AUTH_RATE_LIMIT: brute force e credential
 * stuffing no login, enumeração de emails no registo (S9) e uploads pesados.
 */
export const StrictThrottle = () =>
  Throttle({ default: { limit: AUTH_RATE_LIMIT, ttl: RATE_LIMIT_TTL_MS } });
