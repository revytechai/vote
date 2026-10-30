import { LogLevel as NestLogLevel } from '@nestjs/common';
import { AppConfig, LogLevel } from './config.interface';
import { loadConfig } from './config.loader';

export interface LoggerLike {
  log(message: any, ...optionalParams: any[]): void;
  warn(message: any, ...optionalParams: any[]): void;
  error(message: any, ...optionalParams: any[]): void;
}

export interface ConfigReloaderOptions {
  configPath: string;
  initialConfig?: AppConfig;
  logger?: LoggerLike;
  onLogLevelChange?: (newLevel: LogLevel) => void;
}

export interface ReloadResult {
  success: boolean;
  config: AppConfig;
  error?: Error;
}

export function mapLogLevelToNest(level: LogLevel): NestLogLevel[] {
  switch (level) {
    case 'debug':
      return ['log', 'error', 'warn', 'debug', 'verbose'];
    case 'info':
      return ['log', 'error', 'warn'];
    case 'warn':
      return ['error', 'warn'];
    case 'error':
      return ['error'];
    default:
      return ['log', 'error', 'warn'];
  }
}

export class ConfigReloader {
  private currentConfig: AppConfig;
  private readonly configPath: string;
  private readonly logger: LoggerLike;
  private readonly onLogLevelChange?: (newLevel: LogLevel) => void;

  constructor(options: ConfigReloaderOptions) {
    this.configPath = options.configPath;
    this.logger = options.logger || console;
    this.onLogLevelChange = options.onLogLevelChange;

    if (options.initialConfig) {
      this.currentConfig = { ...options.initialConfig };
    } else {
      const loadResult = loadConfig(this.configPath);
      this.currentConfig = loadResult.config;
    }
  }

  getCurrentConfig(): AppConfig {
    return { ...this.currentConfig };
  }

  reload(): ReloadResult {
    try {
      const loadResult = loadConfig(this.configPath, { explicit: true });
      const newConfig = loadResult.config;

      // Check if host or port changed
      if (
        newConfig.host !== this.currentConfig.host ||
        newConfig.port !== this.currentConfig.port
      ) {
        this.logger.warn(
          `Configuration host/port changed (${this.currentConfig.host}:${this.currentConfig.port} -> ${newConfig.host}:${newConfig.port}). A server restart is required for host and port changes to take effect.`,
        );
      }

      // Check if log_level changed
      if (newConfig.log_level !== this.currentConfig.log_level) {
        this.logger.log(
          `Live-updating log level: ${this.currentConfig.log_level} -> ${newConfig.log_level}`,
        );
        if (this.onLogLevelChange) {
          this.onLogLevelChange(newConfig.log_level);
        }
      }

      this.currentConfig = newConfig;
      return {
        success: true,
        config: this.currentConfig,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to reload configuration from ${this.configPath}: ${err.message}. Retaining existing configuration.`,
      );
      return {
        success: false,
        config: this.currentConfig,
        error: err,
      };
    }
  }

  registerSignalHandler(): void {
    process.on('SIGHUP', () => {
      this.logger.log('Received SIGHUP, reloading configuration...');
      this.reload();
    });
  }
}
