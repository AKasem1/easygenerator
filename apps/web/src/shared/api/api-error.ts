import axios from 'axios';

import { isErrorCode } from '@shared';
import type { ApiErrorResponse } from '@shared';

/** Narrows an unknown thrown value to the API's error envelope, or null. */
export function parseApiError(error: unknown): ApiErrorResponse | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const data: unknown = error.response?.data;

  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const candidate = data as Partial<ApiErrorResponse>;

  return isErrorCode(candidate.errorCode) ? (candidate as ApiErrorResponse) : null;
}

export const GENERIC_ERROR_MESSAGE =
  'Something went wrong. Please check your connection and try again.';
