import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);
  configureApp(app, { corsOrigin: config.get('CORS_ORIGIN', { infer: true }) });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  app.get(Logger).log(`API listening on http://localhost:${port} (prefix: /api/v1)`);
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet if config validation failed, so use console here.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
