import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';

import { signInSchema } from '@shared';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { apiClient, refreshClient, resetRefreshState } from '@/shared/api/client';
import { setAccessToken } from '@/shared/api/token-store';

import { SignInPage } from './SignInPage';

const CREDENTIALS = { email: 'ada@example.com', password: 'sup3r!secret' };

function ok(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function apiError(
  config: InternalAxiosRequestConfig,
  status: number,
  body: Record<string, unknown>,
): AxiosError {
  return new AxiosError('Request failed', String(status), config, null, ok(config, body, status));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/app" element={<div>application home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  beforeEach(() => {
    resetRefreshState();
    setAccessToken(null);
    refreshClient.defaults.adapter = async (config) => {
      throw apiError(config, 401, { errorCode: 'INVALID_REFRESH_TOKEN' });
    };
  });

  afterEach(() => {
    resetRefreshState();
    setAccessToken(null);
  });

  it('renders its heading', async () => {
    apiClient.defaults.adapter = async (config) => ok(config, {});
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders a generic form-level error on a 401, not a field error', async () => {
    const user = userEvent.setup();

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-in') {
        throw apiError(config, 401, {
          statusCode: 401,
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          requestId: 'r1',
          timestamp: 'now',
        });
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), CREDENTIALS.email);
    await user.type(screen.getByLabelText(/password/i), CREDENTIALS.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });

    // Neither field is blamed: the server will not say which was wrong.
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/password/i)).not.toHaveAttribute('aria-invalid');
  });

  it('shows a readable error when the API is unreachable', async () => {
    const user = userEvent.setup();

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-in') {
        throw new AxiosError('Network Error', 'ERR_NETWORK', config, null, undefined);
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), CREDENTIALS.email);
    await user.type(screen.getByLabelText(/password/i), CREDENTIALS.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/check your connection/i);
    });
  });

  it('posts the right payload and navigates on success', async () => {
    const user = userEvent.setup();
    let body: unknown;

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-in') {
        body = JSON.parse(String(config.data));
        return ok(config, {
          user: { id: 'u1', email: CREDENTIALS.email, name: 'Ada', createdAt: 'now' },
          accessToken: 'token',
        });
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), CREDENTIALS.email);
    await user.type(screen.getByLabelText(/password/i), CREDENTIALS.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('application home')).toBeInTheDocument();
    });

    expect(body).toEqual(CREDENTIALS);
  });
});

describe('shared schemas via @shared alias', () => {
  it('accepts any non-empty sign-in password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });
});
