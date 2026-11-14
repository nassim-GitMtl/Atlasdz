import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  CorrelationIdSchema,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  SafeApplicationError,
} from '@atlas/contracts';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createApiApplication } from '../src/bootstrap/http.js';

const config = loadRuntimeConfig({
  NODE_ENV: 'test',
  SERVICE_NAME: 'atlas-api-test',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/atlas_test',
  DATABASE_SSL: 'false',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  ENABLE_ELECTRONIC_PAYMENTS: 'false',
  ENABLE_REAL_PAYOUTS: 'false',
});
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});

describe('API foundation', () => {
  let readyApp: INestApplication;
  let unavailableApp: INestApplication;

  before(async () => {
    readyApp = await createApiApplication({
      config,
      logger,
      databaseHealth: { check: async () => true },
    });
    unavailableApp = await createApiApplication({
      config,
      logger,
      databaseHealth: { check: async () => false },
    });
    await Promise.all([readyApp.listen(0, '127.0.0.1'), unavailableApp.listen(0, '127.0.0.1')]);
  });

  after(async () => {
    await Promise.all([readyApp.close(), unavailableApp.close()]);
  });

  it('keeps liveness dependency-free while readiness fails closed', async () => {
    const live = await request(unavailableApp.getHttpServer()).get('/health/live').expect(200);
    const ready = await request(unavailableApp.getHttpServer()).get('/health/ready').expect(503);

    assert.equal(HealthResponseSchema.parse(live.body).status, 'ok');
    assert.equal(HealthResponseSchema.parse(ready.body).status, 'not_ready');
    assert.equal(ready.body.dependencies.postgres, 'down');
  });

  it('returns contract-valid readiness when PostgreSQL is usable', async () => {
    const response = await request(readyApp.getHttpServer()).get('/health/ready').expect(200);
    const health = HealthResponseSchema.parse(response.body);

    assert.equal(health.status, 'ok');
    assert.equal(health.dependencies?.postgres, 'up');
    assert.equal(response.headers['x-correlation-id'], health.correlationId);
  });

  it('echoes valid correlation IDs and replaces unsafe input', async () => {
    const supplied = '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a';
    const accepted = await request(readyApp.getHttpServer())
      .get('/health/live')
      .set('X-Correlation-Id', supplied)
      .expect(200);
    const replaced = await request(readyApp.getHttpServer())
      .get('/health/live')
      .set('X-Correlation-Id', 'unsafe-correlation-value')
      .expect(200);

    assert.equal(accepted.headers['x-correlation-id'], supplied);
    assert.notEqual(replaced.headers['x-correlation-id'], 'unsafe-correlation-value');
    CorrelationIdSchema.parse(replaced.headers['x-correlation-id']);
  });

  it('does not bleed correlation context across concurrent requests', async () => {
    const ids = Array.from({ length: 40 }, () => crypto.randomUUID());
    const responses = await Promise.all(
      ids.map((id) =>
        request(readyApp.getHttpServer())
          .get('/health/live')
          .set('X-Correlation-Id', id)
          .expect(200),
      ),
    );

    assert.deepEqual(
      responses.map((response) => response.body.correlationId),
      ids,
    );
  });

  it('returns stable safe error envelopes for unmatched routes', async () => {
    const response = await request(readyApp.getHttpServer()).get('/not-a-route').expect(404);
    const envelope = ErrorEnvelopeSchema.parse(response.body);

    assert.equal(envelope.code, 'RESOURCE_NOT_FOUND');
    assert.equal(response.headers['x-correlation-id'], envelope.correlationId);
    assert.equal(JSON.stringify(response.body).includes('NotFoundException'), false);
  });

  it('maps typed application errors without exposing caller-controlled messages', () => {
    const error = new SafeApplicationError('VALIDATION_FAILED', {
      fields: [{ path: 'deviceLabel', reason: 'INVALID_LENGTH' }],
    });

    assert.equal(error.status, 422);
    assert.equal(error.safeMessage, 'The request failed validation.');
    assert.deepEqual(error.details, {
      fields: [{ path: 'deviceLabel', reason: 'INVALID_LENGTH' }],
    });
    assert.throws(
      () => new SafeApplicationError('SESSION_NOT_FOUND', { token: 'prohibited' }),
      TypeError,
    );
  });

  it('sets security headers and applies an exact CORS allowlist', async () => {
    const allowed = await request(readyApp.getHttpServer())
      .get('/health/live')
      .set('Origin', 'http://localhost:3001')
      .expect(200);
    const denied = await request(readyApp.getHttpServer())
      .get('/health/live')
      .set('Origin', 'http://localhost:3001.attacker.example')
      .expect(200);

    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:3001');
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    assert.equal(allowed.headers['x-content-type-options'], 'nosniff');
    assert.equal(allowed.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(allowed.headers['cache-control'], 'no-store');
    assert.equal(allowed.headers['strict-transport-security'], undefined);
  });
});
