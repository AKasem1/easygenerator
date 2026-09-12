import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { apiClient, refreshAccessToken, refreshClient, resetRefreshState } from './client';
import { getAccessToken, setAccessToken } from './token-store';

const REFRESHED_TOKEN = 'refreshed-access-token';

function ok(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', '401', config, null, ok(config, {}, 401));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('apiClient refresh interceptor', () => {
  let refreshCalls = 0;
  let protectedCalls = 0;

  beforeEach(() => {
    refreshCalls = 0;
    protectedCalls = 0;
    resetRefreshState();
    setAccessToken('expired-access-token');
  });

  afterEach(() => {
    setAccessToken(null);
    resetRefreshState();
  });

  function mockRefresh(behaviour: 'succeeds' | 'fails'): void {
    const adapter: AxiosAdapter = async (config) => {
      refreshCalls += 1;
      // Widen the window so concurrent callers must share the in-flight promise.
      await delay(20);

      if (behaviour === 'fails') {
        throw unauthorized(config);
      }

      return ok(config, { accessToken: REFRESHED_TOKEN });
    };

    refreshClient.defaults.adapter = adapter;
  }

  /** 401s until the caller presents the refreshed token, then 200. */
  function mockProtectedRoute(): void {
    const adapter: AxiosAdapter = async (config) => {
      protectedCalls += 1;
      await delay(5);

      if (config.headers.Authorization === `Bearer ${REFRESHED_TOKEN}`) {
        return ok(config, { url: config.url });
      }

      throw unauthorized(config);
    };

    apiClient.defaults.adapter = adapter;
  }

  it('fires exactly one refresh when three requests 401 concurrently', async () => {
    mockRefresh('succeeds');
    mockProtectedRoute();

    const responses = await Promise.all([
      apiClient.get('/a'),
      apiClient.get('/b'),
      apiClient.get('/c'),
    ]);

    expect(refreshCalls).toBe(1);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(responses.map((response) => response.data)).toEqual([
      { url: '/a' },
      { url: '/b' },
      { url: '/c' },
    ]);

    // Three initial 401s plus three replays.
    expect(protectedCalls).toBe(6);
    expect(getAccessToken()).toBe(REFRESHED_TOKEN);
  });

  it('replays each request exactly once, never twice', async () => {
    mockRefresh('succeeds');

    // Always 401, even with the refreshed token.
    apiClient.defaults.adapter = async (config) => {
      protectedCalls += 1;
      await delay(5);
      throw unauthorized(config);
    };

    await expect(apiClient.get('/always-401')).rejects.toBeInstanceOf(AxiosError);

    expect(refreshCalls).toBe(1);
    // Original plus one replay, then it gives up.
    expect(protectedCalls).toBe(2);
  });

  it('does not refresh again when the refresh itself fails', async () => {
    mockRefresh('fails');
    mockProtectedRoute();

    const results = await Promise.allSettled([
      apiClient.get('/a'),
      apiClient.get('/b'),
      apiClient.get('/c'),
    ]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBeNull();
  });

  it('starts a new refresh once the previous one has settled', async () => {
    mockRefresh('succeeds');
    mockProtectedRoute();

    await apiClient.get('/first');
    setAccessToken('expired-again');
    await apiClient.get('/second');

    expect(refreshCalls).toBe(2);
  });

  it('shares one in-flight promise between direct callers', async () => {
    mockRefresh('succeeds');

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect([a, b, c]).toEqual([REFRESHED_TOKEN, REFRESHED_TOKEN, REFRESHED_TOKEN]);
    expect(refreshCalls).toBe(1);
  });

  it('does not attach an Authorization header when there is no token', async () => {
    setAccessToken(null);

    let seenHeader: unknown;
    apiClient.defaults.adapter = async (config) => {
      seenHeader = config.headers.Authorization;
      return ok(config, {});
    };

    await apiClient.get('/public');

    expect(seenHeader).toBeUndefined();
  });
});
