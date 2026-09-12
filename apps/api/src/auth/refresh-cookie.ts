import type { CookieOptions } from 'express';

import { REFRESH_TOKEN_TTL_MS } from './refresh-tokens.service';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * path is scoped to /api/v1/auth, so the browser only sends the refresh token to
 * the two endpoints that need it. Getting this path wrong breaks rotation
 * silently: the cookie is simply never sent back.
 */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}
