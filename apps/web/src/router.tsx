import { createBrowserRouter, Navigate } from 'react-router';

import { AppPage } from '@/routes/AppPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { SignInPage } from '@/routes/SignInPage';
import { SignUpPage } from '@/routes/SignUpPage';

/** Placeholder route tree. No guards yet — /app is public for now. */
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/sign-in" replace /> },
  { path: '/sign-up', element: <SignUpPage /> },
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/app', element: <AppPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
