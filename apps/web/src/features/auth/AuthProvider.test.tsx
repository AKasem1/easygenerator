import { render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';

import { apiClient, refreshClient, resetRefreshState } from '@/shared/api/client';
import { setAccessToken } from '@/shared/api/token-store';

import { AuthProvider } from './AuthProvider';
import { GuestRoute } from './GuestRoute';
import { ProtectedRoute } from './ProtectedRoute';

const USER = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function ok(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', '401', config, null, ok(config, {}, 401));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Harness({ start = '/app' }: { start?: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<div>protected content</div>} />
          </Route>
          <Route element={<GuestRoute />}>
            <Route path="/sign-in" element={<div>sign-in page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthProvider bootstrap', () => {
  beforeEach(() => {
    resetRefreshState();
    setAccessToken(null);
  });

  afterEach(() => {
    resetRefreshState();
    setAccessToken(null);
  });

  it('shows a spinner and never flashes sign-in while the first refresh is in flight', async () => {
    refreshClient.defaults.adapter = async (config) => {
      await delay(30);
      return ok(config, { accessToken: 'restored-token' });
    };
    apiClient.defaults.adapter = async (config) => ok(config, USER);

    render(<Harness />);

    // Mid-flight: spinner, and crucially not the sign-in page.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('sign-in page')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('protected content')).toBeInTheDocument();
    });

    expect(screen.queryByText('sign-in page')).not.toBeInTheDocument();
  });

  it('falls back to anonymous and redirects when the refresh 401s', async () => {
    refreshClient.defaults.adapter = async (config) => {
      await delay(5);
      throw unauthorized(config);
    };
    apiClient.defaults.adapter = async (config) => ok(config, USER);

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('sign-in page')).toBeInTheDocument();
    });

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('keeps an authenticated visitor off /sign-in', async () => {
    refreshClient.defaults.adapter = async (config) =>
      ok(config, { accessToken: 'restored-token' });
    apiClient.defaults.adapter = async (config) => ok(config, USER);

    render(<Harness start="/sign-in" />);

    await waitFor(() => {
      expect(screen.getByText('protected content')).toBeInTheDocument();
    });
  });

  it('calls refresh exactly once on mount', async () => {
    let refreshCalls = 0;

    refreshClient.defaults.adapter = async (config) => {
      refreshCalls += 1;
      await delay(5);
      return ok(config, { accessToken: 'restored-token' });
    };
    apiClient.defaults.adapter = async (config) => ok(config, USER);

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('protected content')).toBeInTheDocument();
    });

    expect(refreshCalls).toBe(1);
  });
});
