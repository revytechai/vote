import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigReloader } from '../src/config/config-reloader';

describe('SIGHUP Live Reload', () => {
  let tmpDir: string;
  let configFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vote-sighup-test-'));
    configFile = path.join(tmpDir, 'config.json');
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        host: '127.0.0.1',
        port: 3000,
        log_level: 'info',
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-reads valid config and applies log_level live', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const onLogLevelChange = vi.fn();

    const reloader = new ConfigReloader({
      configPath: configFile,
      logger,
      onLogLevelChange,
    });

    expect(reloader.getCurrentConfig().log_level).toBe('info');

    // Update config on disk to debug
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        host: '127.0.0.1',
        port: 3000,
        log_level: 'debug',
      }),
    );

    const result = reloader.reload();
    expect(result.success).toBe(true);
    expect(reloader.getCurrentConfig().log_level).toBe('debug');
    expect(onLogLevelChange).toHaveBeenCalledWith('debug');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a warning when host or port change, noting restart is required', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const reloader = new ConfigReloader({
      configPath: configFile,
      logger,
    });

    // Update config on disk with new port
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        host: '0.0.0.0',
        port: 8080,
        log_level: 'info',
      }),
    );

    const result = reloader.reload();
    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/restart/i),
    );
  });

  it('retains old active config and logs error without crashing when config is invalid', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const reloader = new ConfigReloader({
      configPath: configFile,
      logger,
    });

    const originalConfig = { ...reloader.getCurrentConfig() };

    // Write invalid JSON to disk
    fs.writeFileSync(configFile, 'INVALID JSON {');

    expect(() => {
      const result = reloader.reload();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }).not.toThrow();

    expect(reloader.getCurrentConfig()).toEqual(originalConfig);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/failed.*reload|syntax/i),
    );
  });
});
