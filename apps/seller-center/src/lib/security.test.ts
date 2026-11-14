import assert from 'node:assert/strict';
import test from 'node:test';
import { apiOrigin, localAccountsEnabled, trustedMutationOrigin } from './security.ts';

const local = {
  APP_ENV: 'local',
  ATLAS_LOCAL_ACCOUNTS: 'true',
  SELLER_API_BASE_URL: 'http://127.0.0.1:3003',
};

test('synthetic account access needs explicit local environment, API and web loopback boundaries', () => {
  assert.equal(localAccountsEnabled(local, '127.0.0.1:3002'), true);
  assert.equal(localAccountsEnabled(local, 'localhost:3002'), true);
  for (const environment of [
    { ...local, APP_ENV: 'production' },
    { ...local, APP_ENV: 'staging' },
    { ...local, ATLAS_LOCAL_ACCOUNTS: 'false' },
    { ...local, APP_ENV: undefined },
    { ...local, SELLER_API_BASE_URL: 'https://remote.example:3003' },
    { ...local, SELLER_API_BASE_URL: 'http://127.0.0.1:3000' },
    { ...local, SELLER_API_BASE_URL: 'http://127.0.0.1:3003@remote.example' },
  ])
    assert.equal(localAccountsEnabled(environment, '127.0.0.1:3002'), false);
  for (const host of [
    null,
    'remote.example:3002',
    '127.0.0.1:3001',
    'localhost:3002.evil.example',
    'localhost:3002/path',
  ]) {
    assert.equal(localAccountsEnabled(local, host), false);
  }
});

test('mutation origin must match the actual host and an explicit trusted origin', () => {
  assert.equal(trustedMutationOrigin(local, 'http://127.0.0.1:3002', '127.0.0.1:3002'), true);
  for (const origin of [
    null,
    'null',
    'https://evil.example',
    'http://127.0.0.1:3002/path',
    'http://localhost:3002',
  ]) {
    assert.equal(trustedMutationOrigin(local, origin, '127.0.0.1:3002'), false);
  }
  assert.equal(
    trustedMutationOrigin({ APP_ENV: 'production' }, 'http://localhost:3002', 'localhost:3002'),
    false,
  );
  const production = { APP_ENV: 'production', SELLER_WEB_ORIGIN: 'https://sellers.example.dz' };
  assert.equal(
    trustedMutationOrigin(production, 'https://sellers.example.dz', 'sellers.example.dz'),
    true,
  );
  assert.equal(trustedMutationOrigin(production, 'https://evil.example', 'evil.example'), false);
  assert.equal(
    trustedMutationOrigin(
      { ...production, SELLER_WEB_ORIGIN: 'http://sellers.example.dz' },
      'http://sellers.example.dz',
      'sellers.example.dz',
    ),
    false,
  );
});

test('API origin rejects credentials, non-http schemes and path/query ambiguity', () => {
  assert.equal(apiOrigin({}), 'http://127.0.0.1:3000');
  for (const url of [
    'file:///tmp/secret',
    'https://user:password@api.example',
    'https://api.example/extra',
    'https://api.example?token=secret',
    'https://api.example#fragment',
  ]) {
    assert.throws(() => apiOrigin({ SELLER_API_BASE_URL: url }));
  }
});
