import { z } from 'zod';

export interface PasswordRule {
  id: 'length' | 'letter' | 'number' | 'special';
  /** Short text for a live checklist in the UI. */
  label: string;
  /** Full sentence used as the validation message. */
  message: string;
  test: (value: string) => boolean;
}

/**
 * The single source of the password policy. `passwordSchema` is built from this
 * list, so a checklist in the UI cannot drift from what the server enforces.
 */
export const passwordRules: readonly PasswordRule[] = [
  {
    id: 'length',
    label: 'At least 8 characters',
    message: 'Password must be at least 8 characters long',
    test: (value) => value.length >= 8,
  },
  {
    id: 'letter',
    label: 'One letter',
    message: 'Password must contain at least one letter',
    test: (value) => /[A-Za-z]/.test(value),
  },
  {
    id: 'number',
    label: 'One number',
    message: 'Password must contain at least one number',
    test: (value) => /[0-9]/.test(value),
  },
  {
    id: 'special',
    label: 'One special character',
    message: 'Password must contain at least one special character',
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

export const passwordSchema = passwordRules.reduce(
  (schema, rule) => schema.refine(rule.test, { message: rule.message }),
  z.string(),
);

export type Password = z.infer<typeof passwordSchema>;
