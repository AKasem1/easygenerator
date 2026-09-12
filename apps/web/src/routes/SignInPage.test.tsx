import { render, screen } from '@testing-library/react';

import { signInSchema } from '@shared';

import { SignInPage } from '@/routes/SignInPage';

describe('SignInPage', () => {
  it('renders its heading', () => {
    render(<SignInPage />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('shared schemas via @shared alias', () => {
  it('accepts any non-empty sign-in password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });
});
