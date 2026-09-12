import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { apiClient, refreshClient, resetRefreshState } from '@/shared/api/client';
import { setAccessToken } from '@/shared/api/token-store';

import { AppPage } from './AppPage';

const USER = { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace', createdAt: 'now' };

function ok(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <AuthProvider>
        <Routes>
          <Route path="/app" element={<AppPage />} />
          <Route path="/sign-in" element={<div>sign-in page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppPage', () => {
  beforeEach(() => {
    resetRefreshState();
    setAccessToken(null);
    // A restorable session: the bootstrap refresh succeeds.
    refreshClient.defaults.adapter = async (config) => ok(config, { accessToken: 'token' });
  });

  afterEach(() => {
    resetRefreshState();
    setAccessToken(null);
  });

  it('greets the signed-in user by name', async () => {
    apiClient.defaults.adapter = async (config) => ok(config, USER);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /welcome to the application/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
  });

  it('signs out and navigates to sign-in', async () => {
    const user = userEvent.setup();
    let signOutCalls = 0;

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-out') {
        signOutCalls += 1;
        return ok(config, {}, 204);
      }

      return ok(config, USER);
    };

    renderPage();

    await user.click(await screen.findByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByText('sign-in page')).toBeInTheDocument();
    });

    expect(signOutCalls).toBe(1);
  });

  it('still navigates to sign-in when the sign-out request fails', async () => {
    const user = userEvent.setup();

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-out') {
        throw new AxiosError('Network Error', 'ERR_NETWORK', config, null, undefined);
      }

      return ok(config, USER);
    };

    renderPage();

    await user.click(await screen.findByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByText('sign-in page')).toBeInTheDocument();
    });
  });
});
