import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  moduleRef: TestingModule;
  prisma: PrismaService;
  dbPath: string;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  // An explicit DATABASE_URL selects the database the suite runs against.
  // scripts/db-matrix.sh sets it so that the suite really exercises
  // PostgreSQL or MariaDB instead of SQLite. Without it the suite gets a
  // private SQLite file in the temp directory, as it always did.
  const externalUrl = process.env.DATABASE_URL?.trim();
  const usesExternalDb = Boolean(externalUrl);

  const dbName = `test-${crypto.randomBytes(8).toString('hex')}.db`;
  const dbPath = path.join(os.tmpdir(), dbName);
  const databaseUrl = usesExternalDb ? externalUrl! : `file:${dbPath}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.COOKIE_SECURE = 'false';

  // Push prisma schema to the database under test
  execSync(`npx prisma db push --skip-generate`, {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'ignore',
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  await app.init();

  const prisma = app.get(PrismaService);

  const close = async () => {
    try {
      await app.close();
    } catch {}
    if (usesExternalDb) {
      // The database belongs to whoever set DATABASE_URL. Leave its data
      // alone; only a private temporary file is ours to remove.
      return;
    }
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      const journal = `${dbPath}-journal`;
      if (fs.existsSync(journal)) {
        fs.unlinkSync(journal);
      }
    } catch {}
  };

  return { app, moduleRef, prisma, dbPath, close };
}

export function csrfHeaders(token = 'test-csrf-token-123') {
  return {
    cookie: `rv_csrf=${token}`,
    'x-csrf-token': token,
  };
}

export function getCookie(res: any, name: string): string | undefined {
  const cookies = toCookieArray(res.header['set-cookie']);
  return cookies.find((c) => c.startsWith(`${name}=`));
}

function toCookieArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  if (typeof raw === 'number') {
    return [String(raw)];
  }
  return [];
}
