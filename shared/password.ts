import { z } from 'zod';

/**
 * The canonical password policy for *new* credentials.
 *
 * Each rule carries its own message so the UI can surface exactly which
 * requirement failed instead of a single catch-all string.
 */
export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .regex(/[A-Za-z]/, { message: 'Password must contain at least one letter' })
  .regex(/[0-9]/, { message: 'Password must contain at least one number' })
  .regex(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character',
  });

export type Password = z.infer<typeof passwordSchema>;
