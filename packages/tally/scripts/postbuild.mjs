import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cjsDir = new URL('../dist/cjs/', import.meta.url);

for (const file of ['index.js', 'index.d.ts']) {
  const path = fileURLToPath(new URL(file, cjsDir));
  if (!existsSync(path)) {
    throw new Error(`missing CommonJS build output: ${path}`);
  }
}

// The package is "type": "module", so the CommonJS build needs its own
// package.json to stop Node from parsing dist/cjs/*.js as ESM.
writeFileSync(
  fileURLToPath(new URL('package.json', cjsDir)),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);
