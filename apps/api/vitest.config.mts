import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // zod is aliased too: shared/ sits above this app's node_modules.
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
