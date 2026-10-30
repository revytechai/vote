import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AppConfig } from './config.interface';
import {
  loadConfig,
  DEFAULT_CONFIG_PATH,
  ConfigNotFoundError,
} from './config.loader';

export interface CliResult {
  action: 'exit' | 'start';
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  config?: AppConfig;
  configPath?: string;
  warning?: string;
}

export interface CliOptions {
  defaultPath?: string;
}

function getPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '0.1.0';
    }
  } catch {
    // fallback
  }
  return '0.1.0';
}

function parseConfigArg(
  args: string[],
  index: number,
): { path?: string; nextIndex: number; error?: CliResult } {
  const next = args[index + 1];
  if (next && !next.startsWith('--')) {
    return { path: next, nextIndex: index + 1 };
  }
  return {
    nextIndex: index,
    error: {
      action: 'exit',
      exitCode: 2,
      stderr: 'Error: --config requires a path argument',
    },
  };
}

interface ParsedCliArgs {
  explicitPath?: string;
  isCheckConfig: boolean;
  isDoctor: boolean;
  isJson: boolean;
  error?: CliResult;
}

function parseCliArgs(args: string[]): ParsedCliArgs {
  let explicitPath: string | undefined;
  let isCheckConfig = false;
  let isDoctor = false;
  let isJson = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    let next = i + 1;
    if (arg === '--config') {
      const parsed = parseConfigArg(args, i);
      if (parsed.error) {
        return { isCheckConfig, isDoctor, isJson, error: parsed.error };
      }
      explicitPath = parsed.path;
      next = parsed.nextIndex + 1;
    } else if (arg.startsWith('--config=')) {
      explicitPath = arg.slice('--config='.length);
    } else if (arg === '--check-config') {
      isCheckConfig = true;
    } else if (arg === 'doctor') {
      isDoctor = true;
    } else if (arg === '--json') {
      isJson = true;
    }
    i = next;
  }

  return { explicitPath, isCheckConfig, isDoctor, isJson };
}

async function checkDatabaseReachable(config?: AppConfig): Promise<boolean> {
  if (!config) {
    return false;
  }
  const envVarName = config.database_url_env;
  const dbUrl = process.env[envVarName];
  if (!dbUrl) {
    return false;
  }
  const prisma = new PrismaClient({
    datasources: {
      db: { url: dbUrl },
    },
  });
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function formatDoctorOutput(
  targetPath: string,
  configValid: boolean,
  databaseReachable: boolean,
  isJson: boolean,
): string {
  const version = getPackageVersion();
  if (isJson) {
    const doctorPayload = {
      version,
      config_path: targetPath,
      configPath: targetPath,
      config_valid: configValid,
      configValid: configValid,
      node_version: process.version,
      nodeVersion: process.version,
      database_reachable: databaseReachable,
      databaseReachable: databaseReachable,
    };
    return JSON.stringify(doctorPayload, null, 2);
  }
  return `Version: ${version}\nConfig Path: ${targetPath}\nConfig Valid: ${configValid}\nNode Version: ${process.version}\nDatabase Reachable: ${databaseReachable}`;
}

async function handleDoctor(
  targetPath: string,
  isExplicit: boolean,
  isJson: boolean,
): Promise<CliResult> {
  let config: AppConfig | undefined;
  let configValid = false;

  try {
    const result = loadConfig(targetPath, { explicit: isExplicit });
    config = result.config;
    configValid = true;
  } catch {
    configValid = false;
  }

  const databaseReachable = configValid
    ? await checkDatabaseReachable(config)
    : false;
  const allOk = configValid && databaseReachable;

  return {
    action: 'exit',
    exitCode: allOk ? 0 : 1,
    stdout: formatDoctorOutput(
      targetPath,
      configValid,
      databaseReachable,
      isJson,
    ),
  };
}

function handleCheckConfig(targetPath: string, isExplicit: boolean): CliResult {
  try {
    const result = loadConfig(targetPath, { explicit: isExplicit });
    return {
      action: 'exit',
      exitCode: 0,
      stdout: `Configuration at ${result.path} is valid.`,
    };
  } catch (err: any) {
    return {
      action: 'exit',
      exitCode: err instanceof ConfigNotFoundError ? 2 : 1,
      stderr: err.message,
    };
  }
}

function resolveDevPortFallback(loadResult: {
  isDefaultFallback: boolean;
  config: AppConfig;
}): void {
  if (!loadResult.isDefaultFallback || !process.env.PORT) {
    return;
  }
  const envPort = Number.parseInt(process.env.PORT, 10);
  if (!Number.isNaN(envPort) && envPort > 0) {
    loadResult.config.port = envPort;
  }
}

function handleRegularStart(
  targetPath: string,
  isExplicit: boolean,
): CliResult {
  let loadResult;
  try {
    loadResult = loadConfig(targetPath, { explicit: isExplicit });
  } catch (err: any) {
    return {
      action: 'exit',
      exitCode: err instanceof ConfigNotFoundError ? 2 : 1,
      stderr: err.message,
    };
  }

  resolveDevPortFallback(loadResult);

  return {
    action: 'start',
    config: loadResult.config,
    configPath: loadResult.path,
    warning: loadResult.warning,
  };
}

export async function handleCli(
  args: string[] = process.argv.slice(2),
  options?: CliOptions,
): Promise<CliResult> {
  const parsed = parseCliArgs(args);
  if (parsed.error) {
    return parsed.error;
  }

  const defaultPath = options?.defaultPath || DEFAULT_CONFIG_PATH;
  const targetPath = parsed.explicitPath || defaultPath;
  const isExplicit = Boolean(parsed.explicitPath);

  // If explicit path is provided but does not exist, exit 2
  if (isExplicit && !fs.existsSync(targetPath)) {
    return {
      action: 'exit',
      exitCode: 2,
      stderr: `Configuration file not found: ${targetPath}`,
    };
  }

  // Handle doctor command
  if (parsed.isDoctor) {
    return handleDoctor(targetPath, isExplicit, parsed.isJson);
  }

  // Handle --check-config
  if (parsed.isCheckConfig) {
    return handleCheckConfig(targetPath, isExplicit);
  }

  // Regular startup
  return handleRegularStart(targetPath, isExplicit);
}
