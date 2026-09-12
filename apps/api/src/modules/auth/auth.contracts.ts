// Exercises the @shared alias in compiled output; tsc does not rewrite aliases, tsc-alias does.
export { signInSchema, signUpSchema, passwordSchema } from '@shared';
export type { SignInInput, SignUpInput } from '@shared';
export type { Password } from '@shared/password';
