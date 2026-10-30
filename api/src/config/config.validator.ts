import { AppConfig, LogLevel } from './config.interface';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  host: '127.0.0.1',
  port: 3000,
  log_level: 'info',
  database_url_env: 'DATABASE_URL',
  cookie_secure: false,
  trusted_proxy: false,
};

const ALLOWED_KEYS = new Set<string>([
  'host',
  'port',
  'log_level',
  'database_url_env',
  'cookie_secure',
  'trusted_proxy',
]);

const VALID_LOG_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

function validateUnknownKeys(obj: Record<string, unknown>): void {
  const unknownKeys = Object.keys(obj).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    const formattedUnknown = unknownKeys.map((k) => "'" + k + "'").join(', ');
    const allowed = Array.from(ALLOWED_KEYS).join(', ');
    throw new ConfigValidationError(
      `Unknown configuration key(s): ${formattedUnknown}. Allowed keys are: ${allowed}. Secrets must stay in environment variables.`,
    );
  }
}

function validateHost(host: unknown): void {
  if (host === undefined) {
    return;
  }
  if (typeof host !== 'string') {
    throw new ConfigValidationError(
      `'host' must be a string, received ${typeof host}`,
    );
  }
  if (host.trim().length === 0) {
    throw new ConfigValidationError("'host' cannot be empty");
  }
}

function validatePort(port: unknown): void {
  if (port === undefined) {
    return;
  }
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new ConfigValidationError(
      `'port' must be an integer between 1 and 65535, received: ${JSON.stringify(port)}`,
    );
  }
}

function validateLogLevel(logLevel: unknown): void {
  if (logLevel === undefined) {
    return;
  }
  if (
    typeof logLevel !== 'string' ||
    !VALID_LOG_LEVELS.has(logLevel as LogLevel)
  ) {
    const allowed = Array.from(VALID_LOG_LEVELS).join(', ');
    const displayLevel =
      typeof logLevel === 'string' ? logLevel : JSON.stringify(logLevel);
    throw new ConfigValidationError(
      `Invalid log_level '${displayLevel}'. Allowed values are: ${allowed}`,
    );
  }
}

function validateDatabaseUrlEnv(databaseUrlEnv: unknown): void {
  if (databaseUrlEnv === undefined) {
    return;
  }
  if (typeof databaseUrlEnv !== 'string') {
    throw new ConfigValidationError(
      `'database_url_env' must be a string, received ${typeof databaseUrlEnv}`,
    );
  }
  if (databaseUrlEnv.trim().length === 0) {
    throw new ConfigValidationError("'database_url_env' cannot be empty");
  }
  const envNameRegex = /^[A-Za-z_]\w*$/;
  if (!envNameRegex.test(databaseUrlEnv)) {
    throw new ConfigValidationError(
      `'database_url_env' must be a valid environment variable name (e.g. 'DATABASE_URL'), not a database connection URL. Secrets must stay in environment variables.`,
    );
  }
}

function validateCookieSecure(cookieSecure: unknown): void {
  if (cookieSecure === undefined) {
    return;
  }
  if (typeof cookieSecure !== 'boolean') {
    throw new ConfigValidationError(
      `'cookie_secure' must be a boolean (true or false), received ${typeof cookieSecure}`,
    );
  }
}

function validateTrustedProxy(trustedProxy: unknown): void {
  if (trustedProxy === undefined) {
    return;
  }
  if (typeof trustedProxy !== 'boolean') {
    throw new ConfigValidationError(
      `'trusted_proxy' must be a boolean (true or false), received ${typeof trustedProxy}`,
    );
  }
}

export function parseAndValidateConfig(rawJson: string): AppConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    throw new ConfigValidationError(
      `Invalid JSON syntax (comments and trailing commas are not allowed): ${err.message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigValidationError('Configuration root must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  validateUnknownKeys(obj);
  validateHost(obj.host);
  validatePort(obj.port);
  validateLogLevel(obj.log_level);
  validateDatabaseUrlEnv(obj.database_url_env);
  validateCookieSecure(obj.cookie_secure);
  validateTrustedProxy(obj.trusted_proxy);

  return {
    ...DEFAULT_CONFIG,
    ...(obj as Partial<AppConfig>),
  };
}
