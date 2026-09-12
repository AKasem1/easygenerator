import { z } from 'zod';

/**
 * Environment contract.
 *
 * MONGODB_URI and JWT_SECRET intentionally have NO defaults: a misconfigured
 * deployment must fail loudly at boot rather than silently fall back to a
 * local database or a guessable signing key.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),

  MONGODB_URI: z
    .string()
    .min(1, { message: 'MONGODB_URI is required — the API will not start without it' }),

  /** Use a long, random value in every real environment. */
  JWT_SECRET: z
    .string()
    .min(1, { message: 'JWT_SECRET is required — the API will not start without it' }),

  /** Comma-separated list of exact origins. Wildcards are not accepted,
      because the API is served with `credentials: true`. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

/** Split CORS_ORIGIN into the explicit origin list Nest expects. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
