import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  validateReleaseEnvironment,
  loadReleaseSecrets,
  ReleaseConfigurationError,
} from './release-env.mjs';

const api = {
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  DATABASE_SSL: 'true',
  DATABASE_URL: 'postgresql://test:test@database:5432/atlas_test',
  CORS_ALLOWED_ORIGINS: 'https://shop.example.invalid,https://seller.example.invalid',
  IDENTITY_SECRET_KEY: Buffer.alloc(32, 2).toString('base64'),
};
const web = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  CUSTOMER_WEB_ORIGIN: 'https://shop.example.invalid',
  SELLER_WEB_ORIGIN: 'https://seller.example.invalid',
  CATALOG_API_BASE_URL: 'http://api:3000',
  SELLER_API_BASE_URL: 'http://api:3000',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};
test('validates all release roles without enabling commerce or synthetic accounts', () => {
  for (const service of ['api', 'migrate', 'create-staff'])
    assert.equal(validateReleaseEnvironment(service, api), api);
  const legal = {
    ATLAS_LEGAL_REVIEWED: 'true',
    ATLAS_LEGAL_NAME: 'Atlas DZ SARL',
    ATLAS_LEGAL_ADDRESS: 'Alger',
    ATLAS_LEGAL_RC: '16/00-0000000B26',
    ATLAS_LEGAL_NIF: '000016000000000',
    ATLAS_LEGAL_EMAIL: 'contact@example.dz',
    ATLAS_LEGAL_PHONE: '+213000000000',
    ATLAS_LEGAL_HOST: 'VPS provider',
  };
  assert.throws(
    () => validateReleaseEnvironment('api', { ...api, ATLAS_LIVE_CHECKOUT: 'true' }),
    ReleaseConfigurationError,
  );
  // Live orders need working email: customers confirm their address before checkout.
  assert.throws(
    () =>
      validateReleaseEnvironment('api', {
        ...api,
        ATLAS_LIVE_CHECKOUT: 'true',
        ATLAS_LEGAL_REVIEWED: 'true',
      }),
    /SMTP_URL/,
  );
  assert.equal(
    validateReleaseEnvironment('api', {
      ...api,
      ATLAS_LIVE_CHECKOUT: 'true',
      ATLAS_LEGAL_REVIEWED: 'true',
      SMTP_URL: 'smtps://mailer:secret@smtp.example.dz:465',
    }).ATLAS_LIVE_CHECKOUT,
    'true',
  );
  assert.throws(
    () =>
      validateReleaseEnvironment('customer-web', {
        ...web,
        ...legal,
        ATLAS_LEGAL_NIF: '',
        ATLAS_LIVE_CHECKOUT: 'true',
      }),
    ReleaseConfigurationError,
  );
  assert.equal(
    validateReleaseEnvironment('customer-web', { ...web, ...legal, ATLAS_LIVE_CHECKOUT: 'true' })
      .ATLAS_LEGAL_NAME,
    'Atlas DZ SARL',
  );
  for (const patch of [
    { IDENTITY_SECRET_KEY: undefined },
    { IDENTITY_SECRET_KEY: 'short' },
    { ATLAS_LIVE_CHECKOUT: 'yes' },
  ])
    assert.throws(
      () => validateReleaseEnvironment('api', { ...api, ...patch }),
      ReleaseConfigurationError,
    );
  for (const service of ['customer-web', 'seller-center'])
    assert.equal(validateReleaseEnvironment(service, web), web);
  assert.throws(() => validateReleaseEnvironment('worker', api), ReleaseConfigurationError);
  for (const env of [api, web])
    for (const patch of [
      { APP_ENV: 'local' },
      { APP_ENV: '' },
      { NODE_ENV: 'test' },
      { ATLAS_LOCAL_ACCOUNTS: 'true' },
      { ATLAS_LOCAL_CHECKOUT: 'true' },
      { ENABLE_ELECTRONIC_PAYMENTS: 'true' },
      { ENABLE_REAL_PAYOUTS: 'true' },
      { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    ])
      assert.throws(
        () =>
          validateReleaseEnvironment(env === api ? 'api' : 'customer-web', { ...env, ...patch }),
        ReleaseConfigurationError,
      );
});
test('rejects database SSL overrides and invalid or secret-bearing origins without echoing values', () => {
  for (const patch of [
    { DATABASE_SSL: 'false' },
    { DATABASE_URL: 'postgres://test:test@db/atlas?sslmode=disable' },
    { DATABASE_URL: 'postgres://test:test@db/atlas?sslcert=private' },
    { DATABASE_URL: 'postgres://db/atlas' },
    { CORS_ALLOWED_ORIGINS: '*' },
    { CORS_ALLOWED_ORIGINS: 'https://shop.example.invalid/' },
    { CORS_ALLOWED_ORIGINS: 'http://shop.example.invalid' },
    { CORS_ALLOWED_ORIGINS: 'https://user:private@example.invalid' },
  ])
    assert.throws(
      () => validateReleaseEnvironment('api', { ...api, ...patch }),
      (error) => error instanceof ReleaseConfigurationError && !error.message.includes('private'),
    );
});
test('requires canonical public web origins, a known internal API or TLS, and a canonical 256-bit action key', () => {
  for (const patch of [
    { CUSTOMER_WEB_ORIGIN: 'http://shop.example.invalid' },
    { CUSTOMER_WEB_ORIGIN: 'https://localhost' },
    { CATALOG_API_BASE_URL: 'http://remote.example.invalid' },
    { CATALOG_API_BASE_URL: 'https://api.example.invalid/path' },
    { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: '' },
    { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'a'.repeat(44) },
    { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') },
  ])
    assert.throws(
      () => validateReleaseEnvironment('customer-web', { ...web, ...patch }),
      ReleaseConfigurationError,
    );
  assert.equal(
    validateReleaseEnvironment('customer-web', {
      ...web,
      CATALOG_API_BASE_URL: 'https://api.example.invalid',
    }).CATALOG_API_BASE_URL,
    'https://api.example.invalid',
  );
});
test('loads bounded mounted secrets without mutating callers or leaking paths/contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-release-env-test-'));
  try {
    const file = join(directory, 'secret');
    await writeFile(file, `${api.DATABASE_URL}\n`, { mode: 0o600 });
    const source = { DATABASE_URL_FILE: file };
    assert.deepEqual(await loadReleaseSecrets(source), { DATABASE_URL: api.DATABASE_URL });
    assert.deepEqual(source, { DATABASE_URL_FILE: file });
    await assert.rejects(
      loadReleaseSecrets({ ...source, DATABASE_URL: api.DATABASE_URL }),
      ReleaseConfigurationError,
    );
    await assert.rejects(
      loadReleaseSecrets({ DATABASE_URL_FILE: join(directory, 'missing') }),
      (error) => error instanceof ReleaseConfigurationError && !error.message.includes(directory),
    );
    const smtp = join(directory, 'smtp');
    await writeFile(smtp, '');
    assert.deepEqual(await loadReleaseSecrets({ SMTP_URL_FILE: smtp }), {});
    await writeFile(file, 'x'.repeat(8193));
    await assert.rejects(loadReleaseSecrets(source), ReleaseConfigurationError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
