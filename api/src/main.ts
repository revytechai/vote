import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { handleCli } from './config/cli';
import { ConfigReloader, mapLogLevelToNest } from './config/config-reloader';

async function bootstrap() {
  const cliResult = await handleCli(process.argv.slice(2));

  if (cliResult.action === 'exit') {
    if (cliResult.stdout) {
      console.log(cliResult.stdout);
    }
    if (cliResult.stderr) {
      console.error(cliResult.stderr);
    }
    process.exit(cliResult.exitCode ?? 0);
  }

  const config = cliResult.config!;
  if (cliResult.warning) {
    console.warn(`[Config] ${cliResult.warning}`);
  }

  // Ensure secrets stay in env vars, but set DATABASE_URL if an alternate env var is configured
  if (config.database_url_env && config.database_url_env !== 'DATABASE_URL') {
    if (process.env[config.database_url_env]) {
      process.env.DATABASE_URL = process.env[config.database_url_env];
    }
  }

  // Propagate cookie_secure to process.env for any middleware/controllers relying on it
  process.env.COOKIE_SECURE = String(config.cookie_secure);

  const nestLogLevels = mapLogLevelToNest(config.log_level);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: nestLogLevels,
  });

  // Apply trusted_proxy
  const expressApp = app.getHttpAdapter().getInstance();
  if (config.trusted_proxy) {
    expressApp.set('trust proxy', 1);
  } else {
    expressApp.set('trust proxy', false);
  }

  app.setGlobalPrefix('api/v1', {
    exclude: ['api/health'],
  });
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  // Set up SIGHUP live reload
  const logger = new Logger('ConfigReloader');
  const reloader = new ConfigReloader({
    configPath: cliResult.configPath!,
    initialConfig: config,
    logger: {
      log: (msg: string) => logger.log(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    },
    onLogLevelChange: (newLevel) => {
      app.useLogger(mapLogLevelToNest(newLevel));
    },
  });
  reloader.registerSignalHandler();

  await app.listen(config.port, config.host);
  console.log(
    `revytechai-vote API listening on ${config.host}:${config.port} (prefix /api/v1)`,
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
