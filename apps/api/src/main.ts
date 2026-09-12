import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService<Env, true>);

  configureApp(app, { corsOrigin: config.get('CORS_ORIGIN', { infer: true }) });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  Logger.log(`API listening on http://localhost:${port} (prefix: /api/v1)`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'Bootstrap');
  process.exit(1);
});
