# Easygenerator

Full-stack authentication in a single repo: a NestJS API and a React client that share
their validation schemas through TypeScript path aliases, so the password policy is
defined exactly once and enforced on both sides.

```
apps/api/          NestJS 12 · Mongoose 9 · argon2id · JWT
apps/web/          React 19 · Vite 8 · Tailwind 4 · react-hook-form
shared/            zod schemas + error codes, consumed via @shared/* (not a package)
docker-compose.yml mongo:7
```

## Quickstart

**1. Create your env file**

```bash
cp .env.example .env
```

Works as-is for local development. `MONGODB_URI` and `JWT_SECRET` are required — the API
refuses to boot without them rather than falling back to a default.

**2. Start MongoDB**

```bash
docker compose up -d
```

**3. Install from the repo root — not from inside an app**

```bash
pnpm install
```

This is load-bearing, not a style preference. `pnpm -C apps/api install` on its own
**fails**: argon2 ships a native install script that pnpm 11 blocks unless approved in a
`pnpm-workspace.yaml`, which this repo deliberately does not have. The root `postinstall`
installs both apps with `--ignore-scripts`, and argon2's bundled prebuilt binary works
fine that way.

**4. Run both apps**

```bash
pnpm dev
```

|          | URL                                            |
| -------- | ---------------------------------------------- |
| Web      | http://localhost:5173                          |
| API      | http://localhost:3000 (routes under `/api/v1`) |
| API docs | http://localhost:3000/api/docs                 |
| Health   | http://localhost:3000/health                   |

Open **http://localhost:5173/sign-up** to create an account. Vite is pinned to port 5173
with `strictPort`, because `CORS_ORIGIN` names that exact port — drifting to 5174 would
silently break every request.

## Scripts

Run from the repo root:

| Script                          | Does                             |
| ------------------------------- | -------------------------------- |
| `pnpm dev`                      | Both apps together               |
| `pnpm dev:api` / `pnpm dev:web` | One at a time                    |
| `pnpm build`                    | Builds both                      |
| `pnpm typecheck`                | `tsc --noEmit` in both           |
| `pnpm test`                     | Vitest in both (52 API + 25 web) |
| `pnpm lint`                     | ESLint + Prettier, check only    |
| `pnpm format`                   | Rewrites with Prettier           |

## API

| Endpoint                     | Auth           | Returns                              |
| ---------------------------- | -------------- | ------------------------------------ |
| `POST /api/v1/auth/sign-up`  | –              | 201 `{ user, accessToken }`          |
| `POST /api/v1/auth/sign-in`  | –              | 200 `{ user, accessToken }`          |
| `POST /api/v1/auth/refresh`  | refresh cookie | 200 `{ accessToken }`                |
| `POST /api/v1/auth/sign-out` | access token   | 204                                  |
| `GET /api/v1/users/me`       | access token   | 200 `{ id, email, name, createdAt }` |
| `GET /health`                | –              | 200 `{ status: 'ok' }`               |

Full OpenAPI at `/api/docs`, including every error code each route can return.

### Errors

Every error response uses one envelope, including 404s on routes that do not exist:

```json
{
  "statusCode": 422,
  "errorCode": "VALIDATION_FAILED",
  "message": "Validation failed",
  "requestId": "01M29RHZ5XPKE6RY1BJVDXZTYA",
  "timestamp": "2026-09-12T02:53:43.487Z",
  "fields": { "password": "Password must contain at least one number" }
}
```

`errorCode` is a stable string exported from `@shared` as the `ErrorCode` union, so the
client switches on a typed value instead of matching message text. `fields` appears only
on `VALIDATION_FAILED`. Unhandled exceptions log the full stack server-side and return a
flat 500 `INTERNAL_ERROR` carrying no stack, driver text, or class names.

Every request carries a ULID request id — taken from `x-request-id` if the client sends
one — echoed in the response header, embedded in the envelope, and attached to every log
line, so a user-reported error maps to its server logs.

## Security decisions

**Tokens.** The access token lives 15 minutes and is returned in the response body only;
it is held in React state and never written to `localStorage`, `sessionStorage`, or a
cookie. The refresh token is a separate `httpOnly`, `SameSite=Strict` cookie (`Secure` in
production) scoped to `path=/api/v1/auth`, so the browser only sends it to refresh and
sign-out.

**Rotation and reuse detection.** Every refresh revokes the presented token and issues a
new one. Presenting an already-revoked token is treated as theft and revokes every refresh
token for that user, so a stolen token cannot outlive its first reuse.

**Hashing.** Passwords use argon2id at library defaults. Refresh tokens use sha256 — a
deliberate asymmetry: 32 bytes of CSPRNG output has no dictionary to attack, so a
memory-hard hash would only add latency to every refresh.

**No user enumeration on sign-in.** Unknown email and wrong password return an identical 401. The unknown-email path verifies against a dummy argon2id hash built with the same
cost parameters, so both branches do equal work and the timing does not leak either.
Sign-up's 409 remains a known enumeration oracle; rate limiting is what makes it
impractical.

**Rate limits.** 100 requests/minute globally; 5/minute on sign-up, sign-in and refresh.
Overridable via `THROTTLE_TTL_MS`, `THROTTLE_GLOBAL_LIMIT` and `THROTTLE_AUTH_LIMIT`.

Also: helmet, CORS restricted to explicit origins with credentials, a 10kb JSON body
limit, and logs that redact `authorization`, `cookie`, `set-cookie` and
`req.body.password`.

## How `shared/` works

`shared/` is not a package and there is no pnpm workspace. Each app resolves it through
aliases:

- **api** — `paths` in `apps/api/tsconfig.json`, plus `shared/**` in `include`
- **web** — `resolve.alias` in `apps/web/vite.config.ts`, mirrored in its `tsconfig.json`

Both also alias `zod` to their own copy, because `shared/` sits above each app's
`node_modules` and cannot resolve it otherwise. Since this is not a workspace,
`pnpm --filter` does not apply; the root scripts use `pnpm -C <dir>`.

The password policy lives in `shared/password.ts` as a list of rules, and `passwordSchema`
is built from that list — so the live checklist on the sign-up form and the server's
validation read the same source and cannot drift.

### The path-alias build trap

`tsc` type-checks `@shared/*` but does not rewrite it in emitted JS, so the compiled API
would crash with `MODULE_NOT_FOUND`. The build runs `tsc-alias` after `tsc`, and the dev
script runs `tsc-alias --watch` alongside `tsc --watch`.

Because `shared/` sits above `apps/api`, the TypeScript program root is the repo root and
output lands at `dist/apps/api/src/main.js`. A postbuild step writes `dist/main.js` as a
stable entrypoint, so `node dist/main.js` works regardless of that layout.

## Environment

| Key                                                                 | Notes                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `API_PORT`                                                          | Default 3000                                                                   |
| `MONGODB_URI`                                                       | **Required**, no fallback                                                      |
| `JWT_SECRET`                                                        | **Required**, no fallback                                                      |
| `CORS_ORIGIN`                                                       | Comma-separated exact origins; wildcards rejected because credentials are sent |
| `THROTTLE_TTL_MS` / `THROTTLE_GLOBAL_LIMIT` / `THROTTLE_AUTH_LIMIT` | Default 60000 / 100 / 5                                                        |
| `MONGO_PORT` / `MONGO_DB`                                           | Used by docker-compose                                                         |
| `VITE_API_URL`                                                      | Must include the `/api/v1` prefix                                              |

`.env` is gitignored; `.env.example` is the template. It deliberately omits `NODE_ENV` —
Vite reads the root `.env`, and setting it there builds React in development mode, adding
~200kB to the production bundle.

## Toolchain notes

Decisions that look odd without the reason:

- **`@nestjs/cli` is not a dependency.** It pulls in `@swc/core`, whose install script
  pnpm blocks. Build and dev call `tsc` directly; `nest-cli.json` remains for
  `pnpm dlx @nestjs/cli generate ...`.
- **Vitest, not Jest, for the API.** Nest 12 is ESM-only and Jest 30 cannot `require` it
  on Node 22. One runner across both apps as a bonus.
- **`@typescript-eslint/consistent-type-imports` is off for `apps/api`.** Nest resolves
  constructor dependencies from `design:paramtypes` at runtime; rewriting an injected
  import to `import type` erases the class and breaks DI. `eslint --fix` did exactly that
  once and took out every `AuthService` test.
- **TypeScript is pinned to 6.0.3**, not 7.x, because `typescript-eslint` caps at
  `<6.1.0`.

See [AI.md](AI.md) for how the project was built with AI assistance.

## Requirements

Node 22+, pnpm 11+, Docker (or a local MongoDB on 27017).
