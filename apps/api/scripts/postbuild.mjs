// shared/ sits above this app, so tsc emits to dist/apps/api/src/main.js; keep a stable entry.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = resolve(apiRoot, 'dist/apps/api/src/main.js');
const shim = resolve(apiRoot, 'dist/main.js');

if (!existsSync(real)) {
  console.error(`postbuild: expected compiled entrypoint at ${real}`);
  process.exit(1);
}

writeFileSync(shim, "'use strict';\nrequire('./apps/api/src/main.js');\n", 'utf8');
console.log('postbuild: wrote dist/main.js -> dist/apps/api/src/main.js');
