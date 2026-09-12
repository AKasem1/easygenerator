import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';

import { notFoundHandler } from './common/not-found.handler';
import { requestId } from './common/request-id';
import { parseCorsOrigins } from './config/env.validation';
import { REFRESH_COOKIE_NAME } from './auth/refresh-cookie';

export interface AppSetupOptions {
  corsOrigin: string;
}

export const DOCS_PATH = 'api/docs';

function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Easygenerator API')
    .setDescription(
      'Every error response uses one envelope: { statusCode, errorCode, message, requestId, timestamp } plus `fields` on VALIDATION_FAILED.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addCookieAuth(REFRESH_COOKIE_NAME)
    .build();

  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config));
}

/**
 * Shared by main.ts and the e2e suite so both exercise the same middleware.
 *
 * Initialises the app, because Swagger and the not-found handler have to be
 * registered after Nest has mounted its router.
 */
export async function configureApp(
  app: NestExpressApplication,
  options: AppSetupOptions,
): Promise<void> {
  const security = helmet();

  app.use(requestId());
  // Swagger UI needs inline scripts, which helmet's default CSP forbids.
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${DOCS_PATH}`) ? next() : security(req, res, next),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  app.enableCors({ origin: parseCorsOrigins(options.corsOrigin), credentials: true });

  // /health stays unprefixed for infrastructure probes.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  await app.init();

  setupSwagger(app);

  app.use(notFoundHandler());
}
