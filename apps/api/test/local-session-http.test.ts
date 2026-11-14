import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppModule } from '../src/app.module.js';
import { LocalSessionController } from '../src/identity/local-session.controller.js';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import { SafeApplicationError } from '@atlas/contracts';
import type { Request } from 'express';

const config = loadRuntimeConfig({
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5432/atlas_test',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3002',
});
const logger = createLogger({
  service: 'atlas-local-session-test',
  environment: 'test',
  level: 'silent',
});
const issuer = {
  createSession: async () => ({
    accessToken: 'synthetic-test-only',
    expiresAt: new Date().toISOString(),
  }),
};
const req = (address = '127.0.0.1', origin?: string) =>
  ({
    socket: { remoteAddress: address },
    headers: origin === undefined ? {} : { origin },
  }) as Request;

describe('explicit local session test boundary', () => {
  it('omits test login from normal application composition', () => {
    assert.equal(
      AppModule.register({ config, logger }).controllers?.includes(LocalSessionController),
      false,
    );
  });
  it('refuses test login in staging, production, or non-loopback composition', () => {
    for (const nodeEnv of ['staging', 'production', 'development'] as const) {
      assert.throws(
        () =>
          AppModule.register({
            config: { ...config, nodeEnv },
            logger,
            localSessionIssuer: issuer,
          }),
        /loopback LOCAL\/TEST/,
      );
    }
    assert.throws(
      () =>
        AppModule.register({
          config: { ...config, host: '0.0.0.0' },
          logger,
          localSessionIssuer: issuer,
        }),
      /loopback LOCAL\/TEST/,
    );
  });
  it('never enables checkout fixtures without loopback local identity composition', () => {
    const policy = {
      environment: 'test' as const,
      customerId: '70000000-0000-4000-8000-000000000002',
      quoteLifetimeSeconds: 600,
      acceptanceWindowSeconds: 3600,
    };
    for (const override of [
      { config },
      { config: { ...config, nodeEnv: 'production' as const } },
      { config: { ...config, host: '0.0.0.0' } },
    ]) {
      assert.throws(
        () => AppModule.register({ ...override, logger, localCheckoutPolicy: policy }),
        /Checkout fixtures require/,
      );
    }
    assert.throws(
      () =>
        AppModule.register({
          config: { ...config, nodeEnv: 'production' },
          logger,
          localSessionIssuer: issuer,
          localCheckoutPolicy: policy,
        }),
      /Checkout fixtures require/,
    );
  });
  it('requires a loopback peer and rejects a foreign browser origin', async () => {
    const controller = new LocalSessionController(issuer);
    await assert.rejects(
      controller.create(req('192.0.2.1'), { account: 'seller' }),
      (error: unknown) => error instanceof SafeApplicationError && error.code === 'FORBIDDEN',
    );
    await assert.rejects(
      controller.create(req('127.0.0.1', 'https://foreign.example'), { account: 'admin' }),
      (error: unknown) => error instanceof SafeApplicationError && error.code === 'FORBIDDEN',
    );
    const result = await controller.create(req(), { account: 'seller' });
    assert.equal(result.accessToken, 'synthetic-test-only');
  });
  it('rejects arbitrary accounts and extra role/seller overrides', async () => {
    for (const input of [
      null,
      [],
      { account: 'owner' },
      { account: 'seller', sellerId: 'another-seller' },
    ]) {
      await assert.rejects(
        new LocalSessionController(issuer).create(req(), input),
        (error: unknown) =>
          error instanceof SafeApplicationError && error.code === 'VALIDATION_FAILED',
      );
    }
  });
  it('bounds local fixture session issuance', async () => {
    const controller = new LocalSessionController(issuer);
    for (let count = 0; count < 10; count++) await controller.create(req(), { account: 'seller' });
    await assert.rejects(
      controller.create(req(), { account: 'seller' }),
      (error: unknown) => error instanceof SafeApplicationError && error.code === 'RATE_LIMITED',
    );
  });
});
