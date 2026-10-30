import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { handleCli, CliResult } from '../src/config/cli';

describe('CLI Options & Subcommands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vote-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('--check-config', () => {
    it('exits 0 with valid config and does not connect to DB', async () => {
      const validConfigPath = path.join(tmpDir, 'valid.json');
      fs.writeFileSync(
        validConfigPath,
        JSON.stringify({
          host: '127.0.0.1',
          port: 4567,
          log_level: 'info',
        }),
      );

      const result = await handleCli(['--config', validConfigPath, '--check-config']);
      expect(result.exitCode).toBe(0);
      expect(result.action).toBe('exit');
    });

    it('exits non-zero with error on stderr for invalid config', async () => {
      const invalidConfigPath = path.join(tmpDir, 'invalid.json');
      fs.writeFileSync(
        invalidConfigPath,
        JSON.stringify({
          host: '127.0.0.1',
          port: 'invalid-port',
        }),
      );

      const result = await handleCli(['--config', invalidConfigPath, '--check-config']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/port.*integer/i);
      expect(result.action).toBe('exit');
    });

    it('exits 2 when explicit config path is missing', async () => {
      const missingPath = path.join(tmpDir, 'missing.json');
      const result = await handleCli(['--config', missingPath, '--check-config']);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/not found/i);
      expect(result.action).toBe('exit');
    });
  });

  describe('doctor --json', () => {
    it('outputs expected JSON structure and exits 0 when config and DB are ok', async () => {
      const validConfigPath = path.join(tmpDir, 'valid.json');
      fs.writeFileSync(
        validConfigPath,
        JSON.stringify({
          host: '127.0.0.1',
          port: 3000,
          database_url_env: 'DATABASE_URL',
        }),
      );

      // Create a dummy sqlite db for testing
      const dbPath = path.join(tmpDir, 'test.db');
      fs.writeFileSync(dbPath, '');
      const prevDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = `file:${dbPath}`;

      try {
        const result = await handleCli(['--config', validConfigPath, 'doctor', '--json']);
        expect(result.exitCode).toBe(0);
        expect(result.action).toBe('exit');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.version).toBe('0.1.0');
        expect(parsed.config_path || parsed.configPath).toBe(validConfigPath);
        expect(parsed.config_valid ?? parsed.configValid).toBe(true);
        expect(parsed.node_version || parsed.nodeVersion).toBeDefined();
        expect(parsed.database_reachable ?? parsed.databaseReachable).toBe(true);
      } finally {
        if (prevDbUrl !== undefined) {
          process.env.DATABASE_URL = prevDbUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('exits 1 when database is unreachable', async () => {
      const validConfigPath = path.join(tmpDir, 'valid.json');
      fs.writeFileSync(
        validConfigPath,
        JSON.stringify({
          host: '127.0.0.1',
          port: 3000,
          database_url_env: 'NON_EXISTENT_DB_VAR',
        }),
      );

      const result = await handleCli(['--config', validConfigPath, 'doctor', '--json']);
      expect(result.exitCode).toBe(1);
      expect(result.action).toBe('exit');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.config_valid ?? parsed.configValid).toBe(true);
      expect(parsed.database_reachable ?? parsed.databaseReachable).toBe(false);
    });
  });

  describe('Port precedence', () => {
    it('uses config port and does NOT allow env PORT to override when config file exists', async () => {
      const configPath = path.join(tmpDir, 'custom-port.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          host: '127.0.0.1',
          port: 4000,
        }),
      );

      const prevPort = process.env.PORT;
      process.env.PORT = '9999';
      try {
        const result = await handleCli(['--config', configPath]);
        expect(result.action).toBe('start');
        expect(result.config.port).toBe(4000);
      } finally {
        if (prevPort !== undefined) {
          process.env.PORT = prevPort;
        } else {
          delete process.env.PORT;
        }
      }
    });

    it('uses env PORT as dev fallback only if no config file is found', async () => {
      const nonExistentDefault = path.join(tmpDir, 'non-existent-default.json');
      const prevPort = process.env.PORT;
      process.env.PORT = '5555';
      try {
        const result = await handleCli([], { defaultPath: nonExistentDefault });
        expect(result.action).toBe('start');
        expect(result.config.port).toBe(5555);
        expect(result.warning).toBeDefined();
      } finally {
        if (prevPort !== undefined) {
          process.env.PORT = prevPort;
        } else {
          delete process.env.PORT;
        }
      }
    });
  });
});
