# AI Usage

AI assistance was used throughout this task: Claude for planning and review,
Claude Code for implementation. This file records what was generated, what was
overridden, and what had to be fixed.

## How the work was structured

The build ran as a sequence of scoped prompts rather than one open-ended
request — scaffold, users + auth core, refresh rotation, cross-cutting concerns,
frontend plumbing, pages, docs. Each prompt stated the decisions up front,
forbade work outside its scope, and ended with a "done means" checklist of
commands that had to actually pass before the pass was considered complete.

That structure mattered more than any individual prompt. Open-ended requests
("build authentication") returned plausible code carrying defaults I would then
have to find and undo — `localStorage` tokens, bcrypt, tests asserting on mocks.
Constraint-first prompts returned code I could review in one sitting.

The "done means" clause was the other half. Without an explicit list of commands
to run, the model reports success on code it never executed. With one, it caught
its own failures before I saw them — including a compiled bundle that built
cleanly and then died on `node dist/main.js`.

## Prompts that worked

**Planning.** I uploaded the brief and offered my own read first: that the spec
is deliberately underspecified, that every applicant will produce a working
login form, and that the grading is really about the decisions the spec leaves
open. That framing produced a plan organised around trade-offs — token storage,
hashing choice, where validation lives — rather than a tutorial. The useful
pushback in return was that delivery speed is an explicit scoring criterion, so
the real risk here is over-engineering; that reframed my scoping and kept
features like RBAC and password reset out.

**Scaffolding.** Structure only, explicitly no business logic, with the known
toolchain hazards named in the prompt and a checklist of commands that had to
pass. Example constraint from that prompt:

> `tsc` does not rewrite path aliases in emitted JS, so the Nest build will
> break at runtime unless you handle it. Verify `node dist/main` actually starts
> before you call this done.

**Feature passes.** Each one carried the non-negotiables inline — argon2id not
bcrypt, sha256 for refresh tokens, identical 401s on sign-in, validation only
from the shared schemas. Stating these as constraints rather than reviewing for
them afterwards saved the most time overall.

## Decisions I made differently from the AI's default

**Token storage.** The first generated implementation put the JWT in
`localStorage`. This is the most common auth pattern in training data and it is
wrong for anything production-facing: any XSS, including from a compromised
transitive dependency, can read it. Reworked to a short-lived access token held
only in React state, with a refresh token in an `httpOnly; Secure;
SameSite=strict` cookie scoped to `/api/v1/auth`, rotated on every use and
stored server-side as a hash. A repo-wide grep confirms no `localStorage`,
`sessionStorage` or `document.cookie` in application source.

**argon2id over bcrypt.** bcrypt was the default suggestion and would not have
been wrong, but argon2id's memory-hardness resists GPU attack in a way bcrypt's
cost factor does not, and it is OWASP's current first choice. When I asked for
the reasoning behind the bcrypt suggestion, there wasn't one — it was a
training-data artefact.

**sha256, not argon2, for refresh tokens.** Having switched password hashing to
argon2, the model applied argon2 to refresh tokens too. Reverted: a refresh
token is 32 bytes of CSPRNG output, so there is no dictionary to attack and no
low-entropy input to protect. Slow memory-hard hashing is for human-chosen
secrets; here it would only add latency to every refresh. The asymmetry is
deliberate and commented as such.

**Single-flight refresh.** The generated axios interceptor called the refresh
endpoint independently on every 401. With token rotation that is broken:
concurrent 401s fire concurrent refreshes, the first rotation invalidates the
cookie, and the rest fail — signing the user out at random under load. Rewritten
to hold one in-flight refresh promise and queue the rest behind it. The
generated version looked correct and passed a naive manual test; it only fails
under concurrency.

**Tests asserting behaviour, not mocks.** The first test pass mocked the
repository so thoroughly that the tests only verified the mocks had been called
and would have passed against a broken implementation. Rewritten around
observable behaviour, with the e2e running against `mongodb-memory-server`.
That decision paid for itself — see the DI bug below.

## Bugs found during the build

**`eslint --fix` silently broke dependency injection.** The
`consistent-type-imports` rule rewrote `import { AuthService }` to
`import type { AuthService }`, which erases the runtime class, so
`design:paramtypes` emits `Object` and Nest cannot resolve the constructor. All
nine `AuthService` tests failed, then the e2e failed on `AuthController` for the
same reason. The code type-checked and built cleanly — it broke only at
container resolution. Caught because the unit tests exercise the real DI
container rather than hand-constructing the service.

The rule is disabled for `apps/api` with the reasoning in its own commit, so a
future contributor who re-enables it hits the explanation via `git blame`. CI
runs `eslint` and `prettier --check` in check-only mode; no automation anywhere
in the repo can perform the autofix.

**Path aliases broke twice, in different ways.** The scaffold prompt named this
risk and it happened anyway. First, the build emitted
`require("../../../../../shared/index.ts")` — correct depth, wrong extension —
traced to a `paths` entry pointing at `index.ts`; fixed by dropping the
extension and verified by loading the compiled file. Second, `nest start --watch`
never runs `tsc-alias` at all, so development would have broken the moment
anything imported `@shared` while production worked; replaced with
`tsc --watch` + `tsc-alias --watch` + `node --watch`, verified live by adding a
real `@shared` import mid-run.

**React StrictMode would have double-fired the bootstrap refresh.** React
double-invokes effects in development, and a second refresh replaying a rotated
cookie is exactly what trips the server's own reuse detection — it would have
signed the user out on every dev reload. Single-flight does not cover this,
since the second invoke can land after the first settles. Guarded with a ref.

**`PassportModule` imported bare provides nothing** — `AuthModuleOptions` only
exists via `.register()`, and `UsersModule` needs its own registration because
`UsersController` applies the guard.

**Timing side channel on sign-in.** Responses were already identical for
unknown-email and wrong-password, but an unknown email skipped the argon2 verify
and returned measurably faster, which is still an enumeration vector. Closed by
verifying against a module-level dummy argon2id hash generated with the same
cost parameters, so both paths do equal work. Tested by asserting `argon2.verify`
is called for an unknown email — deliberately not by a timing assertion, which
would be flaky on a shared CI runner.

## Where the AI was right and my assumption was wrong

I expected Vitest's esbuild transform to drop decorator metadata and require
`unplugin-swc`. It didn't — Vite 8's transform emits metadata from tsconfig, and
`AuthService`'s dependencies resolved through the real container unaided. Adding
`unplugin-swc` would in fact have caused a problem, since `@swc/core`'s blocked
install script is the same reason `@nestjs/cli` was dropped.

## Toolchain decisions forced by the environment

- **No pnpm workspace.** The shared Zod schemas live in a plain `shared/` folder
  consumed through tsconfig path aliases by both apps. This kept setup fast but
  cost more in build plumbing than expected — `pnpm -C` instead of `--filter`, a
  postbuild step to write a stable `dist/main.js` entry, and the alias handling
  above. A documented trade-off, not an accident.
- **`@nestjs/cli` dropped.** Its `@swc/core` dependency has an install script
  that pnpm blocks without a `pnpm-workspace.yaml`, which would have failed CI.
  Build and dev call `tsc` directly; `nest-cli.json` remains for
  `pnpm dlx @nestjs/cli generate`.
- **Vitest for the API, not Jest.** Nest 12 is ESM-only and Jest 30 cannot
  require it on Node 22. This also gives one test runner across both apps.
- **`--ignore-scripts` on app installs**, because `argon2`'s native install
  script is blocked the same way; its bundled prebuild works, verified by real
  hashing. Consequence: install from the repo root, not inside an app. This is
  documented as its own step in the README quickstart.
- **Versions checked against the registry, not recalled.** TypeScript is pinned
  to 6.0.3 rather than 7.0.2 because `typescript-eslint` caps at `<6.1.0`, and
  `baseUrl` is gone as of TS 6. Package versions are among the least reliable
  things an AI emits.

## What I did not delegate

Scope, threat model, and trade-offs with local context. Deciding what _not_ to
build — email verification, password reset, RBAC, OAuth, i18n — is a judgement
about the time box and the brief, and AI reliably suggests building more.
Which attacks matter for an app like this is what determined the cookie flags,
the rate limits, the generic 401 and the dummy-hash verify; those follow from a
decision about context, not from a code-generation prompt.

## Known gaps, consciously left

Sign-up still enumerates accounts through its 409 response. The real fix is to
respond uniformly and send a verification email, which is out of scope here; the
rate limiter is what makes enumeration impractical in the meantime. The refresh
interceptor is verified against mocked adapters and a live browser pass, but not
by an automated end-to-end test against a real server. With more time: refresh
token family revocation surfaced as a device/session list, contract tests
generated from the shared schemas, and email verification.
