export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  host: string;
  port: number;
  log_level: LogLevel;
  database_url_env: string;
  cookie_secure: boolean;
  trusted_proxy: boolean;
}
