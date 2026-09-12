import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAuth } from '@/features/auth/use-auth';
import { SubmitButton } from '@/shared/ui/SubmitButton';

export function AppPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Best effort: the provider clears local state regardless, and leaving
      // the rejection unhandled would crash the page when the API is down.
    } finally {
      navigate('/sign-in', { replace: true });
    }
  };

  return (
    <section className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome to the application.</h1>
      <p className="mt-2 text-slate-700">Signed in as {user?.name}</p>

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void onSignOut();
        }}
      >
        <SubmitButton isPending={isSigningOut} pendingLabel="Logging out">
          Log out
        </SubmitButton>
      </form>
    </section>
  );
}
