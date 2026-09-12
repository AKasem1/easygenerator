import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/env.validation';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGIN', { infer: true })),
    credentials: true,
  });

  // `/health` stays unprefixed so infrastructure probes have a stable path.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  Logger.log(`API listening on http://localhost:${port} (prefix: /api/v1)`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // Config validation and the initial Mongo connection both fail here.
  // Surface the reason and exit non-zero rather than leaving a half-dead process.
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'Bootstrap');
  process.exit(1);
});
