import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerApiOrigin,
  customerLocalEnabled,
  customerLocalCheckoutEnabled,
  customerTrustedOrigin,
} from './customer-security.ts';
const local = {
  APP_ENV: 'local',
  ATLAS_LOCAL_ACCOUNTS: 'true',
  CATALOG_API_BASE_URL: 'http://127.0.0.1:3003',
};
test('synthetic checkout requires its own opt-in and the local account boundary', () => {
  assert.equal(customerLocalCheckoutEnabled(local, 'localhost:3001'), false);
  const checkout = { ...local, ATLAS_LOCAL_CHECKOUT: 'true' };
  assert.equal(customerLocalCheckoutEnabled(checkout, 'localhost:3001'), true);
  for (const env of [
    { ...checkout, APP_ENV: 'production' },
    { ...checkout, ATLAS_LOCAL_ACCOUNTS: 'false' },
    { ...checkout, CATALOG_API_BASE_URL: 'https://api.example' },
  ])
    assert.equal(customerLocalCheckoutEnabled(env, 'localhost:3001'), false);
  assert.equal(customerLocalCheckoutEnabled(checkout, 'shop.example'), false);
});
test('customer synthetic login needs explicit local flags and both loopback origins', () => {
  assert.equal(customerLocalEnabled(local, 'localhost:3001'), true);
  for (const env of [
    { ...local, APP_ENV: 'production' },
    { ...local, APP_ENV: 'staging' },
    { ...local, ATLAS_LOCAL_ACCOUNTS: 'false' },
    { ...local, CATALOG_API_BASE_URL: 'https://elsewhere.example' },
  ])
    assert.equal(customerLocalEnabled(env, 'localhost:3001'), false);
  for (const host of [
    null,
    'localhost:3002',
    'elsewhere.example:3001',
    'localhost:3001/path',
    'localhost:3001@evil.example',
  ])
    assert.equal(customerLocalEnabled(local, host), false);
});
test('customer mutation origins fail closed and never accept cross-origin forms', () => {
  assert.equal(customerTrustedOrigin(local, 'http://localhost:3001', 'localhost:3001'), true);
  for (const origin of [
    null,
    'null',
    'https://evil.example',
    'http://127.0.0.1:3001',
    'http://localhost:3001/path',
  ])
    assert.equal(customerTrustedOrigin(local, origin, 'localhost:3001'), false);
  assert.equal(
    customerTrustedOrigin(
      { CUSTOMER_WEB_ORIGIN: 'https://shop.example' },
      'https://shop.example',
      'shop.example',
    ),
    true,
  );
  assert.equal(
    customerTrustedOrigin(
      { CUSTOMER_WEB_ORIGIN: 'http://shop.example' },
      'http://shop.example',
      'shop.example',
    ),
    false,
  );
});
test('customer API rejects ambiguous and credential-bearing origins', () => {
  for (const origin of [
    'file:///secret',
    'https://user:pass@example.com',
    'https://api.example/path',
    'https://api.example?token=x',
  ])
    assert.throws(() => customerApiOrigin({ CATALOG_API_BASE_URL: origin }));
});
