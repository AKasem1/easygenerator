import { Navigate, Outlet } from 'react-router';

import { Spinner } from '@/shared/ui/Spinner';

import { useAuth } from './use-auth';

/** The inverse of ProtectedRoute: keeps signed-in users off /sign-in and /sign-up. */
export function GuestRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Spinner label="Checking your session" />;
  }

  if (user) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
