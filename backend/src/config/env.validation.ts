import { z } from 'zod';

export const databaseUrlSchema = z
  .string({ error: 'obrigatória' })
  .regex(/^postgres(ql)?:\/\//, 'deve ser uma URL postgresql://');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: databaseUrlSchema,
});

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
