import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { apiClient, refreshClient, resetRefreshState } from '@/shared/api/client';
import { setAccessToken } from '@/shared/api/token-store';

import { SignUpPage } from './SignUpPage';

const VALID = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'sup3r!secret',
};

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
    <MemoryRouter initialEntries={['/sign-up']}>
      <AuthProvider>
        <Routes>
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/app" element={<div>application home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SignUpPage', () => {
  beforeEach(async () => {
    resetRefreshState();
    setAccessToken(null);
    // Nobody is signed in: the bootstrap refresh 401s.
    refreshClient.defaults.adapter = async (config) => {
      throw apiError(config, 401, { errorCode: 'INVALID_REFRESH_TOKEN' });
    };
  });

  afterEach(() => {
    resetRefreshState();
    setAccessToken(null);
  });

  it('surfaces an error for every field when submitted empty', async () => {
    const user = userEvent.setup();
    apiClient.defaults.adapter = async (config) => ok(config, {});

    renderPage();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    });

    expect(screen.getByLabelText(/name/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(3);
  });

  it('surfaces the specific rule when the password has no digit', async () => {
    const user = userEvent.setup();
    apiClient.defaults.adapter = async (config) => ok(config, {});

    renderPage();

    await user.type(screen.getByLabelText(/email/i), VALID.email);
    await user.type(screen.getByLabelText(/name/i), VALID.name);
    await user.type(screen.getByLabelText(/password/i), 'superb!pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/must contain at least one number/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/at least 8 characters long/i)).not.toBeInTheDocument();
  });

  it('ticks each requirement in the live checklist as it is met', async () => {
    const user = userEvent.setup();
    apiClient.defaults.adapter = async (config) => ok(config, {});

    renderPage();

    const list = screen.getByRole('list', { name: /requirements/i });
    const items = () => screen.getAllByRole('listitem');

    expect(list).toBeInTheDocument();
    expect(items().filter((li) => li.textContent?.includes('— met'))).toHaveLength(0);

    await user.type(screen.getByLabelText(/password/i), 'abcdefgh');

    await waitFor(() => {
      const met = items().filter((li) => li.textContent?.includes('— met'));
      // length + letter satisfied, number + special not yet.
      expect(met).toHaveLength(2);
    });

    await user.type(screen.getByLabelText(/password/i), '1!');

    await waitFor(() => {
      expect(items().filter((li) => li.textContent?.includes('— met'))).toHaveLength(4);
    });
  });

  it('posts the right payload on a valid submit', async () => {
    const user = userEvent.setup();
    let signUpBody: unknown;

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-up') {
        signUpBody = JSON.parse(String(config.data));
        return ok(
          config,
          {
            user: { id: 'u1', email: VALID.email, name: VALID.name, createdAt: 'now' },
            accessToken: 'token',
          },
          201,
        );
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), VALID.email);
    await user.type(screen.getByLabelText(/name/i), VALID.name);
    await user.type(screen.getByLabelText(/password/i), VALID.password);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('application home')).toBeInTheDocument();
    });

    expect(signUpBody).toEqual(VALID);
  });

  it('maps EMAIL_ALREADY_EXISTS onto the email field', async () => {
    const user = userEvent.setup();

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-up') {
        throw apiError(config, 409, {
          statusCode: 409,
          errorCode: 'EMAIL_ALREADY_EXISTS',
          message: 'Email already registered',
          requestId: 'r1',
          timestamp: 'now',
        });
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), VALID.email);
    await user.type(screen.getByLabelText(/name/i), VALID.name);
    await user.type(screen.getByLabelText(/password/i), VALID.password);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });

    // On the field, not a page-level banner.
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/email/i)).toHaveAccessibleDescription(
      /email already registered/i,
    );
  });

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup();
    let signUpCalls = 0;

    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/sign-up') {
        signUpCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return ok(
          config,
          {
            user: { id: 'u1', email: VALID.email, name: VALID.name, createdAt: 'now' },
            accessToken: 'token',
          },
          201,
        );
      }

      return ok(config, {});
    };

    renderPage();

    await user.type(screen.getByLabelText(/email/i), VALID.email);
    await user.type(screen.getByLabelText(/name/i), VALID.name);
    await user.type(screen.getByLabelText(/password/i), VALID.password);

    const button = screen.getByRole('button', { name: /create account/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(screen.getByText('application home')).toBeInTheDocument();
    });

    expect(signUpCalls).toBe(1);
  });
});
