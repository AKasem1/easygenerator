import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { signUpSchema } from '@shared';
import type { SignUpInput } from '@shared';

import { PasswordChecklist } from '@/features/auth/PasswordChecklist';
import { useAuth } from '@/features/auth/use-auth';
import { GENERIC_ERROR_MESSAGE, parseApiError } from '@/shared/api/api-error';
import { FormField } from '@/shared/ui/FormField';
import { SubmitButton } from '@/shared/ui/SubmitButton';

export function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    // onTouched, not onChange: onChange shouts "at least 8 characters" at the
    // second keystroke. The live checklist covers progress instead.
    mode: 'onTouched',
    defaultValues: { email: '', name: '', password: '' },
  });

  const password = watch('password');

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signUp(values);
      navigate('/app', { replace: true });
    } catch (error) {
      const apiError = parseApiError(error);

      if (apiError?.errorCode === 'EMAIL_ALREADY_EXISTS') {
        setError('email', { message: apiError.message });
        return;
      }

      if (apiError?.errorCode === 'VALIDATION_FAILED' && apiError.fields) {
        for (const [field, message] of Object.entries(apiError.fields)) {
          if (field === 'email' || field === 'name' || field === 'password') {
            setError(field, { message });
          }
        }
        return;
      }

      setError('root', { message: apiError?.message ?? GENERIC_ERROR_MESSAGE });
    }
  });

  return (
    <section className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Sign up</h1>

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
          id="name"
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          registration={register('name')}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          description={<PasswordChecklist value={password} />}
          registration={register('password')}
        />

        {errors.root ? (
          <p role="alert" className="text-sm text-red-600">
            {errors.root.message}
          </p>
        ) : null}

        <SubmitButton isPending={isSubmitting} pendingLabel="Creating account">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-indigo-600 underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
