import 'reflect-metadata';

import { seedReferenceDeliveryDestinations, type LiveCheckoutPolicy } from '@atlas/commerce';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import { Pool } from 'pg';

import { createApiApplication } from './bootstrap/http.js';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from './commerce/order-infrastructure.js';
import { ReadinessState } from './health/readiness-state.js';
import { InMemoryRateLimiter } from './rate-limit/in-memory-rate-limiter.js';
import { HttpSmsSender } from './commerce/cod-risk.js';
import { OutboxDispatcher } from './notifications/outbox-dispatcher.js';
import {
  MARKETPLACE_NOTIFIER,
  type MarketplaceNotifier,
} from './notifications/marketplace-notifier.js';
import { SharedDatabasePool } from './shared-database-pool.js';

const config = loadRuntimeConfig(process.env);
if (config.identitySecretKey === null) {
  throw new Error('IDENTITY_SECRET_KEY is required (generate with: openssl rand -base64 32)');
}
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});
const trustProxy = process.env['TRUST_PROXY'];
const liveCheckout = process.env['ATLAS_LIVE_CHECKOUT'] === 'true';
let liveCheckoutPolicy: LiveCheckoutPolicy | undefined;
if (liveCheckout) {
  // Idempotent import of the 69-wilaya / 1541-commune reference register used for delivery rates.
  const seedPool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    max: 1,
  });
  try {
    await seedReferenceDeliveryDestinations(seedPool, 'live');
  } finally {
    await seedPool.end();
  }
  liveCheckoutPolicy = {
    environment: 'live',
    quoteLifetimeSeconds: 15 * 60,
    acceptanceWindowSeconds: 48 * 60 * 60,
  };
}
const app = await createApiApplication({
  config,
  logger,
  passwordIdentity: true,
  links: {
    sellerWebOrigin: process.env['SELLER_WEB_ORIGIN'] ?? null,
    customerWebOrigin: process.env['CUSTOMER_WEB_ORIGIN'] ?? null,
  },
  mediaDirectory: process.env['MEDIA_DIR'] ?? '/data/media',
  ...(process.env['SMS_GATEWAY_URL']
    ? {
        sms: new HttpSmsSender(
          process.env['SMS_GATEWAY_URL'],
          process.env['SMS_GATEWAY_TOKEN'] ?? null,
        ),
      }
    : {}),
  rateLimiter: new InMemoryRateLimiter(),
  ...(liveCheckoutPolicy === undefined ? {} : { liveCheckoutPolicy }),
  ...(trustProxy === undefined || trustProxy === '' ? {} : { trustProxy }),
});

// Expire orders a seller did not accept in time; releases reserved stock.
let expiryRun: Promise<unknown> | undefined;
const expiryTimer = liveCheckout
  ? setInterval(() => {
      if (expiryRun) return;
      expiryRun = app
        .get<OrderRepositoryPort>(ORDER_REPOSITORY)
        .expireDue()
        .then((count) => {
          if (count > 0) logger.info({ count }, 'expired unaccepted seller orders');
        })
        .catch(() =>
          logger.warn({ code: 'ORDER_EXPIRY_FAILED' }, 'order expiry failed; will retry'),
        )
        .finally(() => {
          expiryRun = undefined;
        });
    }, 60_000)
  : undefined;
expiryTimer?.unref();
const dispatcher = new OutboxDispatcher(
  app.get(SharedDatabasePool).pool,
  app.get<MarketplaceNotifier>(MARKETPLACE_NOTIFIER),
  logger,
);
dispatcher.start();
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.fatal({ signal }, 'second shutdown signal received');
    process.exit(1);
  }

  shuttingDown = true;
  if (expiryTimer) clearInterval(expiryTimer);
  await dispatcher.stop();
  app.get(ReadinessState).beginDrain();
  logger.info({ signal }, 'shutdown started');

  const hardDeadline = setTimeout(() => {
    logger.fatal('graceful shutdown deadline exceeded');
    process.exit(1);
  }, 25_000);
  hardDeadline.unref();

  try {
    await expiryRun;
    await app.close();
    logger.info({ signal }, 'shutdown completed');
  } catch {
    logger.fatal({ signal }, 'graceful shutdown failed');
    process.exitCode = 1;
  } finally {
    clearTimeout(hardDeadline);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

await app.listen(config.port, config.host);
logger.info({ host: config.host, port: config.port, liveCheckout }, 'API listening');
