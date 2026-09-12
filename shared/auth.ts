import { z } from 'zod';
import { passwordSchema } from './password';

export const signUpSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email address' }),
  name: z
    .string()
    .trim()
    .min(3, { message: 'Name must be at least 3 characters long' }),
  password: passwordSchema,
});

/**
 * Sign-in deliberately does NOT reuse `passwordSchema`.
 *
 * Validating a login against the current policy would lock out every existing
 * user whose password predates a later tightening of that policy. The only
 * thing sign-in cares about is that the field was filled in; whether the
 * credential is correct is decided by the password hash comparison, not by
 * shape validation.
 */
export const signInSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
