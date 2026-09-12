/**
 * Read at import time because @Throttle decorators are evaluated before Nest
 * builds ConfigService. Defaults are the production values; the overrides exist
 * so the e2e suite can raise them without disabling the guard.
 */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const RATE_LIMIT_TTL_MS = positiveInt('THROTTLE_TTL_MS', 60_000);
export const GLOBAL_RATE_LIMIT = positiveInt('THROTTLE_GLOBAL_LIMIT', 100);
export const AUTH_RATE_LIMIT = positiveInt('THROTTLE_AUTH_LIMIT', 5);
