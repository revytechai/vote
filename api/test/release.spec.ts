import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const repoRoot = path.resolve(__dirname, '../..');

describe('Release Script (scripts/release.sh)', () => {
  const releaseDir = path.join(repoRoot, 'release');

  beforeEach(() => {
    if (fs.existsSync(releaseDir)) {
      fs.rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(releaseDir)) {
      fs.rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('fails if web/browser/index.html is missing without --allow-missing-web', () => {
    const webIndex = path.join(repoRoot, 'web/browser/index.html');
    const webIndexExisted = fs.existsSync(webIndex);

    if (webIndexExisted) {
      fs.renameSync(webIndex, `${webIndex}.bak`);
    }

    try {
      expect(() => {
        execSync(`bash scripts/release.sh`, {
          cwd: repoRoot,
          stdio: 'pipe',
        });
      }).toThrow();
    } finally {
      if (webIndexExisted) {
        fs.renameSync(`${webIndex}.bak`, webIndex);
      }
    }
  });

  it('succeeds with --allow-missing-web and packages expected files', () => {
    const output = execSync(`bash scripts/release.sh --allow-missing-web`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const version = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'api/package.json'), 'utf8'),
    ).version;
    const tarballPath = path.join(releaseDir, `revytechai-vote-${version}.tar.gz`);

    expect(fs.existsSync(tarballPath)).toBe(true);

    // List contents of tarball
    const files = execSync(`tar -tf "${tarballPath}"`, {
      encoding: 'utf8',
    }).split('\n');

    // Verify critical files
    expect(files.some((f) => f.includes('api/dist/main.js'))).toBe(true);
    expect(files.some((f) => f.includes('api/package.json'))).toBe(true);
    expect(files.some((f) => f.includes('api/prisma/schema.prisma'))).toBe(true);
    expect(files.some((f) => f.includes('packages/tally/dist/index.js') || f.includes('packages/tally/dist/esm/index.js') || f.includes('packages/tally/dist/cjs/index.js'))).toBe(true);
    expect(files.some((f) => f.includes('packages/tally/package.json'))).toBe(true);
  });

  it('has release/ in .gitignore', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^release\/?$/m);
  });
});
