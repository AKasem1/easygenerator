/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // The single .env lives at the repo root, next to docker-compose.yml.
  envDir: resolve(here, '../..'),

  resolve: {
    // `shared/` is consumed through path aliases, not as a package. These
    // mirror the tsconfig `paths`; `zod` is aliased too because shared/*.ts
    // sits above this app and cannot resolve apps/web/node_modules on its own.
    alias: [
      { find: /^@shared$/, replacement: resolve(here, '../../shared/index.ts') },
      { find: /^@shared\/(.*)$/, replacement: resolve(here, '../../shared/$1') },
      { find: /^@\/(.*)$/, replacement: resolve(here, 'src/$1') },
      { find: /^zod$/, replacement: resolve(here, 'node_modules/zod') },
    ],
  },

  server: {
    port: 5173,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
});
