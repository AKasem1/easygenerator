import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { getAccessToken, setAccessToken } from './token-store';

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const baseConfig = {
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
};

export const apiClient = axios.create(baseConfig);

/**
 * Deliberately has no response interceptor. The refresh call must never be able
 * to trigger a refresh of its own — that is an infinite loop.
 */
export const refreshClient = axios.create(baseConfig);

let refreshPromise: Promise<string> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Single-flight refresh. If several requests get a 401 at the same moment they
 * all await one rotation: firing several would let the first rotate the cookie
 * and the rest present a revoked token, which trips reuse detection and signs
 * the user out.
 */
export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= refreshClient
    .post<{ accessToken: string }>('/auth/refresh')
    .then((response) => {
      const token = response.data.accessToken;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // One retry per request, and only for a 401.
    if (!config || error.response?.status !== 401 || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      const token = await refreshAccessToken();
      config.headers.Authorization = `Bearer ${token}`;

      return await apiClient.request(config);
    } catch {
      setAccessToken(null);
      onSessionExpired?.();

      return Promise.reject(error);
    }
  },
);

/** Test seam: clears the in-flight refresh between cases. */
export function resetRefreshState(): void {
  refreshPromise = null;
}
