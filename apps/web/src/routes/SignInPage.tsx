import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';

import { signInSchema } from '@shared';
import type { SignInInput } from '@shared';

import { useAuth } from '@/features/auth/use-auth';
import { GENERIC_ERROR_MESSAGE, parseApiError } from '@/shared/api/api-error';
import { FormField } from '@/shared/ui/FormField';
import { SubmitButton } from '@/shared/ui/SubmitButton';

interface RedirectState {
  from?: { pathname?: string };
}

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn(values);

      const state = location.state as RedirectState | null;
      navigate(state?.from?.pathname ?? '/app', { replace: true });
    } catch (error) {
      const apiError = parseApiError(error);

      // Form-level, never per-field: the server deliberately will not say
      // whether the email or the password was wrong.
      setError('root', { message: apiError?.message ?? GENERIC_ERROR_MESSAGE });
    }
  });

  return (
    <section className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          registration={register('email')}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          registration={register('password')}
        />

        {errors.root ? (
          <p role="alert" className="text-sm text-red-600">
            {errors.root.message}
          </p>
        ) : null}

        <SubmitButton isPending={isSubmitting} pendingLabel="Signing in">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        Need an account?{' '}
        <Link to="/sign-up" className="text-indigo-600 underline">
          Sign up
        </Link>
      </p>
    </section>
  );
}
