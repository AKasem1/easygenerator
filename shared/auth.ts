import { z } from 'zod';
import { passwordSchema } from './password';

export const signUpSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email address' }),
  name: z.string().trim().min(3, { message: 'Name must be at least 3 characters long' }),
  password: passwordSchema,
});

// Not passwordSchema: tightening the policy later must not lock out existing users.
export const signInSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
