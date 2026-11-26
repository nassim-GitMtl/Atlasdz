import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createMetricsRegistry, type RuntimeConfig } from '@atlas/platform';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { AppModule, type IdentityRuntimeOverrides } from '../app.module.js';
import type { DatabaseHealthPort } from '../database-health.js';
import { GlobalErrorFilter } from '../errors/global-error.filter.js';
import { correlationMiddleware } from '../middleware/correlation.js';
import { requestObservabilityMiddleware } from '../middleware/request-observability.js';
import type { RateLimiterPort } from '../rate-limit/index.js';
import { NestLogger } from './nest-logger.js';
import type { CatalogRepositoryPort } from '../catalog/catalog-infrastructure.js';
import type { CartRepositoryPort } from '../commerce/cart-infrastructure.js';
import type { OrderRepositoryPort } from '../commerce/order-infrastructure.js';
import type { LiveCheckoutPolicy, SyntheticCheckoutPolicy } from '@atlas/commerce';
import type { LocalSessionIssuer } from '../identity/local-session.controller.js';
import type { PasswordIdentityRepository } from '../identity/password/password-identity.js';
import type { Mailer } from '../notifications/mailer.js';
import type { MarketplaceLinks } from '../notifications/marketplace-notifier.js';
import { MAX_IMAGE_BYTES } from '../media/media.js';
import type { SmsSender } from '../commerce/cod-risk.js';

export interface CreateApiApplicationOptions {
  readonly config: RuntimeConfig;
  readonly logger: Logger;
  readonly databaseHealth?: DatabaseHealthPort;
  readonly identity?: IdentityRuntimeOverrides;
  readonly rateLimiter?: RateLimiterPort;
  readonly catalog?: CatalogRepositoryPort;
  readonly cart?: CartRepositoryPort;
  readonly orders?: OrderRepositoryPort;
  readonly localCheckoutPolicy?: SyntheticCheckoutPolicy;
  readonly liveCheckoutPolicy?: LiveCheckoutPolicy;
  readonly localSessionIssuer?: LocalSessionIssuer;
  readonly passwordIdentity?: PasswordIdentityRepository | true;
  readonly mailer?: Mailer;
  readonly links?: MarketplaceLinks;
  readonly mediaDirectory?: string;
  readonly sms?: SmsSender;
  /** Express `trust proxy` value when running behind the release reverse proxy. */
  readonly trustProxy?: string;
}

export async function createApiApplication(
  options: CreateApiApplicationOptions,
): Promise<INestApplication> {
  const app = await NestFactory.create(
    AppModule.register(options),
    new (await import('@nestjs/platform-express')).ExpressAdapter(),
    {
      bodyParser: false,
      abortOnError: false,
      bufferLogs: false,
      logger: new NestLogger(options.logger),
    },
  );
  if (options.trustProxy !== undefined) {
    (app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', options.trustProxy);
  }
  const metrics = createMetricsRegistry(options.config.serviceName);

  app.use(correlationMiddleware);
  app.use(requestObservabilityMiddleware(options.logger, metrics));
  app.use(
    helmet({
      hsts: false,
      referrerPolicy: { policy: 'no-referrer' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use((_request: express.Request, response: express.Response, next: express.NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Product photo uploads are the only non-JSON bodies the API accepts.
  for (const path of [
    '/api/v1/seller/products/:productId/image',
    '/api/v1/seller/products/:productId/gallery',
    '/api/v1/seller/logo',
  ]) {
    app.use(
      path,
      express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }),
    );
  }
  app.use(express.json({ limit: options.config.requestBodyLimitBytes, strict: true }));
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'X-Correlation-Id',
    ],
    exposedHeaders: [
      'X-Correlation-Id',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After',
    ],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, origin === undefined || options.config.corsAllowedOrigins.includes(origin));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: false,
      whitelist: true,
      forbidNonWhitelisted: true,
      errorHttpStatusCode: 422,
    }),
  );
  app.useGlobalFilters(app.get(GlobalErrorFilter));

  return app;
}
