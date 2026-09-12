/**
 * The api's view of the shared auth contracts.
 *
 * Re-exported through a single module so controllers/pipes depend on this
 * seam rather than reaching across the repo, and so the `@shared/*` alias is
 * exercised by the compiled bundle (tsc does not rewrite path aliases on its
 * own — see the `tsc-alias` step in this package's build script).
 */
export { signInSchema, signUpSchema, passwordSchema } from '@shared';
export type { SignInInput, SignUpInput } from '@shared';

// Exercises the wildcard mapping (`@shared/*`) alongside the barrel above.
export type { Password } from '@shared/password';
