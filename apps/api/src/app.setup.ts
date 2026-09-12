import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { parseCorsOrigins } from './config/env.validation';

export interface AppSetupOptions {
  corsOrigin: string;
}

// Shared by main.ts and the e2e suite so both exercise the same middleware.
export function configureApp(app: NestExpressApplication, options: AppSetupOptions): void {
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  app.enableCors({ origin: parseCorsOrigins(options.corsOrigin), credentials: true });

  // /health stays unprefixed for infrastructure probes.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
}
