import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvalidEnvironmentError, loadRuntimeConfig } from '../src/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  SERVICE_NAME: 'atlas-api-test',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/atlas_test',
  DATABASE_SSL: 'false',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001, http://127.0.0.1:3001',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  ENABLE_ELECTRONIC_PAYMENTS: 'false',
  ENABLE_REAL_PAYOUTS: 'false',
};

describe('runtime configuration', () => {
  it('rejects malformed CORS origins in every environment', () => {
    for (const origin of [
      '*',
      'null',
      'https://user:secret@example.com',
      'https://example.com/path',
      'https://example.com/',
      'file:///tmp/local',
    ])
      assert.throws(
        () => loadRuntimeConfig({ ...validEnvironment, CORS_ALLOWED_ORIGINS: origin }),
        InvalidEnvironmentError,
      );
  });
  it('requires verified TLS and forbids synthetic entrypoints in production/staging', () => {
    const release = {
      ...validEnvironment,
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_SSL: 'true',
      CORS_ALLOWED_ORIGINS: 'https://shop.example.invalid,https://seller.example.invalid',
      IDENTITY_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    };
    assert.equal(loadRuntimeConfig(release).databaseSsl, true);
    assert.equal(loadRuntimeConfig(release).identitySecretKey?.length, 32);
    for (const patch of [
      { IDENTITY_SECRET_KEY: undefined },
      { IDENTITY_SECRET_KEY: 'too-short' },
      { DATABASE_SSL: 'false' },
      { PORT: '0' },
      { CORS_ALLOWED_ORIGINS: 'http://shop.example.invalid' },
      { DATABASE_URL: `${validEnvironment['DATABASE_URL']}?sslmode=require` },
      { DATABASE_URL: `${validEnvironment['DATABASE_URL']}?ssl=false` },
      { ATLAS_LOCAL_ACCOUNTS: 'true' },
      { ATLAS_LOCAL_CHECKOUT: 'true' },
      { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    ])
      for (const NODE_ENV of ['production', 'staging'])
        assert.throws(
          () => loadRuntimeConfig({ ...release, ...patch, NODE_ENV }),
          InvalidEnvironmentError,
        );
  });
  it('parses known values and normalizes origin lists', () => {
    const config = loadRuntimeConfig(validEnvironment);

    assert.equal(config.port, 0);
    assert.deepEqual(config.corsAllowedOrigins, ['http://localhost:3001', 'http://127.0.0.1:3001']);
    assert.equal(config.electronicPaymentsEnabled, false);
    assert.equal(config.realPayoutsEnabled, false);
  });

  it('fails closed when payment or payout flags are enabled', () => {
    for (const field of ['ENABLE_ELECTRONIC_PAYMENTS', 'ENABLE_REAL_PAYOUTS'] as const) {
      assert.throws(
        () => loadRuntimeConfig({ ...validEnvironment, [field]: 'true' }),
        (error: unknown) =>
          error instanceof InvalidEnvironmentError && error.invalidFields.includes(field),
      );
    }
  });

  it('reports field names without leaking invalid secret-bearing values', () => {
    const sensitiveValue = 'do-not-leak://admin:secret@invalid';

    assert.throws(
      () => loadRuntimeConfig({ ...validEnvironment, DATABASE_URL: sensitiveValue }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidEnvironmentError);
        assert.ok(error.message.includes('DATABASE_URL'));
        assert.ok(!error.message.includes(sensitiveValue));
        return true;
      },
    );
  });
});
