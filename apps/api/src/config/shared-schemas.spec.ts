import { signInSchema, signUpSchema } from '@shared';
import type { SignUpInput } from '@shared';

// Proves the @shared alias resolves in the api at type and runtime level.
describe('shared schemas (via @shared alias)', () => {
  it('accepts a valid sign-up payload', () => {
    const input: SignUpInput = {
      email: 'someone@example.com',
      name: 'Ada Lovelace',
      password: 'sup3r!secret',
    };

    expect(signUpSchema.parse(input)).toEqual(input);
  });

  it('rejects a weak sign-up password', () => {
    const result = signUpSchema.safeParse({
      email: 'someone@example.com',
      name: 'Ada Lovelace',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('does not apply the password policy to sign-in', () => {
    const result = signInSchema.safeParse({ email: 'someone@example.com', password: 'x' });

    expect(result.success).toBe(true);
  });
});
