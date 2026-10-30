import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const requirePackage = createRequire(import.meta.url);

interface ExportCondition {
  types: string;
  default: string;
}

interface PackageManifest {
  main: string;
  types: string;
  exports: {
    '.': {
      import: ExportCondition;
      require: ExportCondition;
    };
  };
}

function readManifest(): PackageManifest {
  return JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as PackageManifest;
}

describe('published package surface', () => {
  it('declares an import condition and a require condition', () => {
    const manifest = readManifest();
    const entry = manifest.exports['.'];

    expect(entry.import.default).toMatch(/\.js$/);
    expect(entry.import.types).toMatch(/\.d\.ts$/);
    expect(entry.require.default).toMatch(/\.js$/);
    expect(entry.require.types).toMatch(/\.d\.ts$/);

    // Legacy resolvers ignore "exports" and fall back to "main", so "main"
    // has to point at the CommonJS build.
    expect(manifest.main).toBe(entry.require.default);
  });

  it('loads through the require condition from CommonJS', () => {
    const tallyModule = requirePackage('@revytechai/tally');

    expect(typeof tallyModule.tally).toBe('function');

    const result = tallyModule.tally('score', [1, 2], [{ 1: 3 }, { 2: 4 }]);
    expect(result.winner).toBe(2);
    expect(result.rows[0].total).toBe(4);
  });

  it('loads through the import condition from ESM', () => {
    const script = [
      "import { tally } from '@revytechai/tally';",
      "const result = tally('score', [1, 2], [{ 1: 3 }, { 2: 4 }]);",
      'console.log(JSON.stringify({ winner: result.winner, total: result.rows[0].total }));',
    ].join('\n');

    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageRoot,
      encoding: 'utf8',
    });

    expect(JSON.parse(stdout)).toEqual({ winner: 2, total: 4 });
  });
});
