export const ERROR_CODES = [
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'TOO_MANY_REQUESTS',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorResponse {
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  requestId: string;
  timestamp: string;
  /** Present only on VALIDATION_FAILED: field name to the first message for it. */
  fields?: Record<string, string>;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
