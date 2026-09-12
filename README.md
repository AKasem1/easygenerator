# Easygenerator

Single-repo full-stack scaffold: a NestJS API and a React/Vite web client that share Zod schemas
through TypeScript path aliases.

```
apps/api/          NestJS 12 + Mongoose
apps/web/          React 19 + Vite + Tailwind
shared/            plain .ts files, consumed via @shared/* (not a package)
docker-compose.yml mongo:7
```

## Getting started

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```

- API: http://localhost:3000 (routes under `/api/v1`, health at `/health`)
- Web: http://localhost:5173

## Scripts

Run from the repo root:

| Script           | Does                                    |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Runs both apps concurrently             |
| `pnpm build`     | Builds both apps                        |
| `pnpm typecheck` | `tsc --noEmit` in both apps             |
| `pnpm test`      | Vitest in both apps                     |
| `pnpm lint`      | ESLint + Prettier check across the repo |
| `pnpm format`    | Rewrites files with Prettier            |

## How `shared/` works

`shared/` is not a package and there is no pnpm workspace. Each app resolves it through aliases:

- **api** — `paths` in `apps/api/tsconfig.json`, plus `shared/**` in `include`
- **web** — `resolve.alias` in `apps/web/vite.config.ts`, mirrored in its `tsconfig.json`

Both apps also alias `zod` to their own copy, because `shared/` sits above each app's
`node_modules` and cannot resolve it otherwise.

Because this repo is not a workspace, `pnpm --filter` does not apply; the root scripts use
`pnpm -C <dir>` instead, and `pnpm install` at the root chains both app installs via `postinstall`.

### The path-alias build trap

`tsc` type-checks `@shared/*` but does not rewrite it in emitted JS, so the compiled API would
crash at runtime with `MODULE_NOT_FOUND`. The API build therefore runs `tsc-alias` after `tsc`,
and the dev script runs `tsc-alias --watch` alongside `tsc --watch`.

Because `shared/` lives above `apps/api`, the TypeScript program root is the repo root and output
lands at `dist/apps/api/src/main.js`. A postbuild step writes `dist/main.js` as a stable
entrypoint, so `node dist/main.js` works regardless of that layout.

## Auth

| Endpoint              | Auth           | Returns                            |
| --------------------- | -------------- | ---------------------------------- |
| `POST /auth/sign-up`  | –              | 201 { user, accessToken }          |
| `POST /auth/sign-in`  | –              | 200 { user, accessToken }          |
| `POST /auth/refresh`  | refresh cookie | 200 { accessToken }                |
| `POST /auth/sign-out` | access token   | 204                                |
| `GET /users/me`       | access token   | 200 { id, email, name, createdAt } |

Access tokens live 15m and are returned in the body only, never in a cookie. The refresh token is
an httpOnly, SameSite=Strict cookie scoped to `path=/api/v1/auth`, so the browser only sends it to
refresh and sign-out. Getting that path wrong breaks rotation silently — the cookie is simply never
sent back.

Refresh tokens rotate on every use: the presented record is revoked and a new one issued. Presenting
an already-revoked token is treated as theft and revokes every refresh token for that user.

Passwords use argon2id; refresh tokens use sha256, because 32 bytes of CSPRNG output has no
dictionary to attack and a memory-hard hash would only add latency to every refresh.

## Cross-cutting behaviour

Every error response uses one envelope:

```json
{
  "statusCode": 422,
  "errorCode": "VALIDATION_FAILED",
  "message": "Validation failed",
  "requestId": "01M29RHZ5XPKE6RY1BJVDXZTYA",
  "timestamp": "2026-09-12T02:53:43.487Z",
  "fields": { "email": "Enter a valid email address" }
}
```

`errorCode` is a stable string exported from `@shared` as the `ErrorCode` union, so the frontend
switches on a typed value. `fields` appears only on VALIDATION_FAILED. Unhandled exceptions log the
full stack server-side and return a flat 500 INTERNAL_ERROR carrying no driver text or class names.

Requests carry a ULID request id, taken from `x-request-id` when the client supplies one. It is
echoed in the response header, included in the envelope and attached to every log line.

Logs redact `authorization`, `cookie`, `set-cookie` and `req.body.password`; pretty in development,
JSON in production.

Rate limits default to 100/min globally and 5/min on sign-up, sign-in and refresh. All three are
overridable via `THROTTLE_TTL_MS`, `THROTTLE_GLOBAL_LIMIT` and `THROTTLE_AUTH_LIMIT`, which is how
the functional e2e raises them without disabling the guard.

## Notes

- `.env` is gitignored; `.env.example` is the template. It deliberately omits `NODE_ENV` — Vite
  reads the root `.env` and would otherwise build React in development mode.
- The API refuses to boot without `MONGODB_URI` and `JWT_SECRET`; there are no fallback defaults.
- `@nestjs/cli` is not a dependency. It pulls in `@swc/core`, whose install script pnpm 11 blocks
  unless approved in a `pnpm-workspace.yaml`. Use `pnpm dlx @nestjs/cli generate ...` when you need
  the generators; `nest-cli.json` is present for it.
- Nest 12 is ESM-only, which Jest cannot `require` on Node 22, so both apps test with Vitest.
- App installs run with `--ignore-scripts` (via the root `postinstall`). argon2 ships a prebuilt
  binary, and approving its install script would require a `pnpm-workspace.yaml`. Run installs from
  the repo root, not inside an app.
- `@typescript-eslint/consistent-type-imports` is off for `apps/api`: rewriting an injected import to
  `import type` erases the runtime class and breaks Nest DI.
