import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { SignInInput, SignUpInput } from '@shared';

import { refreshAccessToken, setOnSessionExpired } from '@/shared/api/client';
import { setAccessToken } from '@/shared/api/token-store';

import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';
import {
  fetchCurrentUser,
  signInRequest,
  signOutRequest,
  signUpRequest,
  type AuthUser,
} from './auth.api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // StrictMode double-invokes effects in development; the bootstrap must not
  // run twice, or the second refresh replays a rotated cookie.
  const bootstrapped = useRef(false);

  const applySession = useCallback((token: string, nextUser: AuthUser) => {
    setAccessToken(token);
    setToken(token);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }

    bootstrapped.current = true;

    // No cancellation flag here on purpose. StrictMode runs the effect, its
    // cleanup, then the effect again; the ref makes the second run a no-op, so
    // a flag set by the first cleanup would never be cleared and the loading
    // state would stick forever. Setting state after unmount is a no-op in
    // React 18+, so letting this finish is safe.
    const restore = async () => {
      try {
        const token = await refreshAccessToken();
        applySession(token, await fetchCurrentUser());
      } catch {
        // A 401 here just means nobody is signed in.
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    void restore();
  }, [applySession, clearSession]);

  useEffect(() => {
    setOnSessionExpired(clearSession);

    return () => {
      setOnSessionExpired(null);
    };
  }, [clearSession]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      const result = await signInRequest(input);
      applySession(result.accessToken, result.user);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const result = await signUpRequest(input);
      applySession(result.accessToken, result.user);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    try {
      await signOutRequest();
    } finally {
      // Local state clears even if the server call fails.
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isLoading, signIn, signUp, signOut }),
    [user, accessToken, isLoading, signIn, signUp, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
