import type { ApiErrorResponse, ErrorCode } from '@shared';

export interface ErrorBodyInput {
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  requestId: string | undefined;
  fields?: Record<string, string>;
}

/** Single source of the envelope shape, shared by the filter and the 404 handler. */
export function buildErrorBody(input: ErrorBodyInput): ApiErrorResponse {
  return {
    statusCode: input.statusCode,
    errorCode: input.errorCode,
    message: input.message,
    requestId: input.requestId ?? 'unknown',
    timestamp: new Date().toISOString(),
    ...(input.fields ? { fields: input.fields } : {}),
  };
}
