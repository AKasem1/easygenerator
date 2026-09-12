/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],

  envDir: resolve(here, '../..'),

  resolve: {
    // zod is aliased too: shared/ sits above this app's node_modules.
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
