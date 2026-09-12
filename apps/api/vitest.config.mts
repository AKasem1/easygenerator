import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    // Nest resolves providers from `design:paramtypes` metadata. esbuild (Vitest's
    // default transform) does not emit decorator metadata, so SWC handles TS here.
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
    }),
  ],
  resolve: {
    // Mirrors the tsconfig `paths`. `zod` is aliased because shared/*.ts sits
    // above this app and so cannot resolve apps/api/node_modules on its own.
    alias: [
      { find: /^@shared$/, replacement: resolve(here, '../../shared/index.ts') },
      { find: /^@shared\/(.*)$/, replacement: resolve(here, '../../shared/$1') },
      { find: /^zod$/, replacement: resolve(here, 'node_modules/zod') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: here,
  },
});
