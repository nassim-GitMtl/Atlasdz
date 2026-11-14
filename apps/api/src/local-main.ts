import 'reflect-metadata';
import {
  seedSyntheticDeliveryDestinations,
  seedReferenceDeliveryDestinations,
} from '@atlas/commerce';

import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import { Pool } from 'pg';
import { createApiApplication } from './bootstrap/http.js';
import { ReadinessState } from './health/readiness-state.js';
import { createLocalCatalogIdentity } from './identity/local-catalog-identity.js';
import type { RateLimitRequest } from './rate-limit/index.js';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from './commerce/order-infrastructure.js';

if (
  process.env['ATLAS_LOCAL_ACCOUNTS'] !== 'true' ||
  !['local', 'test'].includes(process.env['NODE_ENV'] ?? '')
) {
  throw new Error(
    'Synthetic catalog accounts require explicit ATLAS_LOCAL_ACCOUNTS=true and NODE_ENV=local|test',
  );
}
// Loopback by default. ATLAS_LOCAL_HOST=0.0.0.0 lets a phone on the same Wi-Fi reach the local
// API while testing the mobile app with Expo Go (mobile/README.md).
const config = loadRuntimeConfig({
  ...process.env,
  HOST: process.env['ATLAS_LOCAL_HOST'] ?? '127.0.0.1',
  PORT: '3003',
});
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.databaseUrl).hostname)) {
  throw new Error('Synthetic catalog accounts require a loopback database');
}
if (config.identitySecretKey === null) {
  throw new Error('IDENTITY_SECRET_KEY is required (generate with: openssl rand -base64 32)');
}
const logger = createLogger({
  service: 'atlas-local-catalog-api',
  environment: config.nodeEnv,
  level: config.logLevel,
});
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 4,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 3_000,
});
const identity = createLocalCatalogIdentity(pool, config.nodeEnv);
if (process.env['ATLAS_LOCAL_CHECKOUT'] === 'true') {
  await seedSyntheticDeliveryDestinations(pool, config.nodeEnv);
  await seedReferenceDeliveryDestinations(pool, config.nodeEnv);
}
const counters = new Map<string, { startedAt: number; count: number }>();
const rateLimiter = {
  async consume(input: RateLimitRequest) {
    const now = Date.now();
    const key = `${input.subjectId}:${input.operation}`;
    let counter = counters.get(key);
    if (counter === undefined || now - counter.startedAt >= 60_000) {
      // Only three synthetic users exist; cap defensively if more callers are ever added.
      if (counters.size >= 1000) counters.clear();
      counter = { startedAt: now, count: 0 };
      counters.set(key, counter);
    }
    counter.count++;
    return {
      allowed: counter.count <= 100,
      limit: 100,
      remaining: Math.max(0, 100 - counter.count),
      resetAfterSeconds: Math.max(1, Math.ceil((60_000 - (now - counter.startedAt)) / 1_000)),
    };
  },
};
const app = await createApiApplication({
  config,
  logger,
  identity: { credentialVerifier: identity.credentialVerifier },
  localSessionIssuer: identity,
  passwordIdentity: true,
  mediaDirectory:
    process.env['MEDIA_DIR'] ?? new URL('../../../var/media', import.meta.url).pathname,
  rateLimiter,
  ...(process.env['ATLAS_LOCAL_CHECKOUT'] === 'true'
    ? {
        localCheckoutPolicy: {
          environment: config.nodeEnv as 'local' | 'test',
          customerId: '70000000-0000-4000-8000-000000000002',
          quoteLifetimeSeconds: 600,
          acceptanceWindowSeconds: 3600,
        },
      }
    : {}),
});
let expiryRun: Promise<unknown> | undefined;
const expiryTimer =
  process.env['ATLAS_LOCAL_CHECKOUT'] === 'true'
    ? setInterval(() => {
        if (expiryRun) return;
        expiryRun = app
          .get<OrderRepositoryPort>(ORDER_REPOSITORY)
          .expireDue()
          .catch(() =>
            logger.warn(
              { code: 'LOCAL_ORDER_EXPIRY_FAILED' },
              'Synthetic order expiry failed; retrying next interval',
            ),
          )
          .finally(() => {
            expiryRun = undefined;
          });
      }, 5000)
    : undefined;
expiryTimer?.unref();
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  if (expiryTimer) clearInterval(expiryTimer);
  app.get(ReadinessState).beginDrain();
  const deadline = setTimeout(() => process.exit(1), 15_000);
  deadline.unref();
  try {
    await expiryRun;
    await app.close();
    await pool.end();
  } finally {
    clearTimeout(deadline);
  }
};
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
await app.listen(config.port, config.host);
logger.info(
  { host: config.host, port: config.port, dataClass: 'synthetic' },
  'LOCAL test accounts enabled; not a production identity provider',
);
