import * as fs from 'node:fs';
import { AppConfig } from './config.interface';
import {
  parseAndValidateConfig,
  DEFAULT_CONFIG,
} from './config.validator';

export { ConfigValidationError } from './config.validator';
export { DEFAULT_CONFIG, parseAndValidateConfig };

export class ConfigNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`Configuration file not found: ${filePath}`);
    this.name = 'ConfigNotFoundError';
  }
}

export const DEFAULT_CONFIG_PATH = '/usr/local/etc/cloudbsd/vote/config.json';

export interface LoadConfigOptions {
  explicit?: boolean;
}

export interface LoadConfigResult {
  config: AppConfig;
  path: string;
  isDefaultFallback: boolean;
  warning?: string;
}

export function loadConfig(
  configPath?: string,
  options?: LoadConfigOptions,
): LoadConfigResult {
  const isExplicit = options?.explicit ?? false;
  const targetPath = configPath || DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(targetPath)) {
    if (isExplicit) {
      throw new ConfigNotFoundError(targetPath);
    }
    return {
      config: { ...DEFAULT_CONFIG },
      path: targetPath,
      isDefaultFallback: true,
      warning: `Default configuration file ${targetPath} not found; using defaults`,
    };
  }

  const raw = fs.readFileSync(targetPath, 'utf8');
  const config = parseAndValidateConfig(raw);

  return {
    config,
    path: targetPath,
    isDefaultFallback: false,
  };
}
