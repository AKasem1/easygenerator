import { Navigate, Outlet, useLocation } from 'react-router';

import { Spinner } from '@/shared/ui/Spinner';

import { useAuth } from './use-auth';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Spinner label="Checking your session" />;
  }

  if (!user) {
    // `replace` keeps the guard out of history, so Back does not bounce between
    // the guarded route and sign-in. `state.from` lets sign-in return here.
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
