import { createBrowserRouter, Navigate } from 'react-router';

import { GuestRoute } from '@/features/auth/GuestRoute';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AppPage } from '@/routes/AppPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { SignInPage } from '@/routes/SignInPage';
import { SignUpPage } from '@/routes/SignUpPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    element: <GuestRoute />,
    children: [
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/sign-in', element: <SignInPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [{ path: '/app', element: <AppPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
