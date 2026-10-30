import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  parseAndValidateConfig,
  loadConfig,
  DEFAULT_CONFIG,
  ConfigValidationError,
  ConfigNotFoundError,
} from '../src/config/config.loader';

describe('Config Loader & Validator', () => {
  it('loads default config when all keys are omitted', () => {
    const config = parseAndValidateConfig('{}');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.log_level).toBe('info');
    expect(config.database_url_env).toBe('DATABASE_URL');
    expect(config.cookie_secure).toBe(false);
    expect(config.trusted_proxy).toBe(false);
  });

  it('parses valid custom config successfully', () => {
    const json = JSON.stringify({
      host: '10.0.0.18',
      port: 8080,
      log_level: 'debug',
      database_url_env: 'PROD_DB_URL',
      cookie_secure: true,
      trusted_proxy: true,
    });
    const config = parseAndValidateConfig(json);
    expect(config.host).toBe('10.0.0.18');
    expect(config.port).toBe(8080);
    expect(config.log_level).toBe('debug');
    expect(config.database_url_env).toBe('PROD_DB_URL');
    expect(config.cookie_secure).toBe(true);
    expect(config.trusted_proxy).toBe(true);
  });

  it('rejects JSON comments with actionable error', () => {
    const jsonWithComment = `{\n  // comment\n  "host": "127.0.0.1"\n}`;
    expect(() => parseAndValidateConfig(jsonWithComment)).toThrowError(
      /comment|syntax/i,
    );
  });

  it('rejects unknown keys with actionable error message', () => {
    const json = JSON.stringify({
      host: '127.0.0.1',
      unknown_key: 'value',
    });
    expect(() => parseAndValidateConfig(json)).toThrowError(
      /unknown.*unknown_key/i,
    );
  });

  it('rejects secret keys in JSON (secrets must stay in env vars)', () => {
    const json = JSON.stringify({
      database_url: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(() => parseAndValidateConfig(json)).toThrowError(
      /unknown.*database_url/i,
    );
  });

  it('rejects connection string inside database_url_env', () => {
    const json = JSON.stringify({
      database_url_env: 'sqlite:./dev.db',
    });
    expect(() => parseAndValidateConfig(json)).toThrowError(
      /database_url_env.*environment variable name/i,
    );
  });

  it('rejects invalid host types', () => {
    expect(() => parseAndValidateConfig(JSON.stringify({ host: 123 }))).toThrowError(
      /host.*string/i,
    );
    expect(() => parseAndValidateConfig(JSON.stringify({ host: '' }))).toThrowError(
      /host.*empty/i,
    );
  });

  it('rejects invalid port values', () => {
    expect(() => parseAndValidateConfig(JSON.stringify({ port: '3000' }))).toThrowError(
      /port.*integer/i,
    );
    expect(() => parseAndValidateConfig(JSON.stringify({ port: 70000 }))).toThrowError(
      /port.*65535/i,
    );
    expect(() => parseAndValidateConfig(JSON.stringify({ port: 0 }))).toThrowError(
      /port.*1.*65535/i,
    );
    expect(() => parseAndValidateConfig(JSON.stringify({ port: 3000.5 }))).toThrowError(
      /port.*integer/i,
    );
  });

  it('rejects invalid log_level values', () => {
    expect(() => parseAndValidateConfig(JSON.stringify({ log_level: 'verbose' }))).toThrowError(
      /log_level.*debug.*info.*warn.*error/i,
    );
  });

  it('rejects non-boolean cookie_secure and trusted_proxy', () => {
    expect(() => parseAndValidateConfig(JSON.stringify({ cookie_secure: 'true' }))).toThrowError(
      /cookie_secure.*boolean/i,
    );
    expect(() => parseAndValidateConfig(JSON.stringify({ trusted_proxy: 1 }))).toThrowError(
      /trusted_proxy.*boolean/i,
    );
  });

  it('rejects non-object root JSON', () => {
    expect(() => parseAndValidateConfig('["item"]')).toThrowError(/object/i);
    expect(() => parseAndValidateConfig('"string"')).toThrowError(/object/i);
    expect(() => parseAndValidateConfig('null')).toThrowError(/object/i);
  });

  it('verifies that api/config.example.json exists and is valid', () => {
    const examplePath = path.resolve(__dirname, '../config.example.json');
    expect(fs.existsSync(examplePath)).toBe(true);
    const content = fs.readFileSync(examplePath, 'utf8');
    const config = parseAndValidateConfig(content);
    expect(config.host).toBe('10.0.0.18');
    expect(config.port).toBe(3000);
  });

  it('loadConfig uses defaults with warning if default path missing', () => {
    const nonExistentDefault = path.resolve(__dirname, 'fixtures/missing-default.json');
    const result = loadConfig(nonExistentDefault, { explicit: false });
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.isDefaultFallback).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it('loadConfig throws ConfigNotFoundError if explicit path is missing', () => {
    const nonExistentExplicit = path.resolve(__dirname, 'fixtures/missing-explicit.json');
    expect(() => loadConfig(nonExistentExplicit, { explicit: true })).toThrowError(
      ConfigNotFoundError,
    );
  });
});
