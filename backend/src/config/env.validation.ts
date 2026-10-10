import { z } from 'zod';

export const databaseUrlSchema = z
  .string({ error: 'obrigatória' })
  .regex(/^postgres(ql)?:\/\//, 'deve ser uma URL postgresql://');

/** Marca dos valores do .env.example, que só servem para desenvolvimento. */
const EXAMPLE_MARKER = 'change-me';

/**
 * Produção (D19, S25): recusa valores do .env.example nas variáveis indicadas.
 * Partilhada pela API e pelo seed, que corre antes da API no arranque.
 */
export function rejectExampleValues(
  env: { NODE_ENV?: string } & Record<string, unknown>,
  keys: readonly string[],
  ctx: z.RefinementCtx,
): void {
  if (env.NODE_ENV !== 'production') return;
  for (const key of keys) {
    const value = env[key];
    if (
      typeof value === 'string' &&
      value.toLowerCase().includes(EXAMPLE_MARKER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `valor de exemplo (${EXAMPLE_MARKER}…) não é permitido em produção`,
      });
    }
  }
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: databaseUrlSchema,
    // Assina os JWT de sessão (HS256). Trocar o valor termina todas as sessões.
    JWT_SECRET: z
      .string({ error: 'obrigatória' })
      .min(32, 'deve ter pelo menos 32 caracteres'),
    // Número de proxies à frente da API (nginx = 1). O IP do cliente, usado no
    // rate limiting, é o que o último proxy acrescentou ao X-Forwarded-For.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    // Cookie de sessão só por HTTPS. Padrão: ativo em produção.
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    // Swagger em /api/docs (D44). Padrão: desligado em produção, onde o mapa
    // da API não precisa de ficar público.
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    // Lida só para a verificação de produção; quem a usa é o seed.
    SEED_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    rejectExampleValues(
      env,
      ['JWT_SECRET', 'DATABASE_URL', 'SEED_PASSWORD'],
      ctx,
    );
    if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === 'false') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message:
          'não pode ser false em produção (o cookie de sessão exige HTTPS)',
      });
    }
  })
  .transform(
    ({
      COOKIE_SECURE,
      SWAGGER_ENABLED,
      SEED_PASSWORD: _seedPassword,
      ...env
    }) => ({
      ...env,
      COOKIE_SECURE:
        COOKIE_SECURE === undefined
          ? env.NODE_ENV === 'production'
          : COOKIE_SECURE === 'true',
      SWAGGER_ENABLED:
        SWAGGER_ENABLED === undefined
          ? env.NODE_ENV !== 'production'
          : SWAGGER_ENABLED === 'true',
    }),
  );

export type Env = z.infer<typeof envSchema>;

/** Formata os erros do Zod numa mensagem legível para o arranque. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  config: Record<string, unknown>,
): z.infer<T> {
  const result = schema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return result.data;
}

/** Usado pelo ConfigModule: falha o arranque se o ambiente for inválido. */
export function validateEnv(config: Record<string, unknown>): Env {
  return parseOrThrow(envSchema, config);
}
