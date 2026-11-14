import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import {
  CreateSupportCaseInputSchema,
  SupportActionInputSchema,
  SetSellerDeliveryRateInputSchema,
  SupportPageQuerySchema,
} from '../src/index.js';

it('validates bounded bilingual support text and rejects hidden characters and ownership overrides', () => {
  const input = {
    sellerOrderId: randomUUID(),
    category: 'RETURN_REQUEST',
    body: 'مساعدة في الطلب\nMerci au vendeur.',
  };
  assert.equal(CreateSupportCaseInputSchema.safeParse(input).success, true);
  for (const body of [
    '',
    'abcd',
    'x'.repeat(2001),
    'message\u0000',
    'message\u202e',
    'message\u200b',
  ])
    assert.equal(CreateSupportCaseInputSchema.safeParse({ ...input, body }).success, false);
  assert.equal(
    CreateSupportCaseInputSchema.safeParse({ ...input, sellerId: randomUUID() }).success,
    false,
  );
  const action = {
    requestId: randomUUID(),
    expectedVersion: 1,
    action: 'REPLY',
    body: 'Valid reply',
  };
  assert.equal(SupportActionInputSchema.safeParse(action).success, true);
  for (const expectedVersion of [0, -1, 1.5, 2147483647])
    assert.equal(SupportActionInputSchema.safeParse({ ...action, expectedVersion }).success, false);
  for (const query of [
    { beforeVersion: '0' },
    { beforeVersion: '1.5' },
    { beforeVersion: ['1', '2'] },
    { owner: randomUUID() },
  ])
    assert.equal(SupportPageQuerySchema.safeParse(query).success, false);
});
it('accepts exact free/paid destination rates and explicit inheritance without scope injection', () => {
  const input = {
    expectedVersion: 0,
    enabled: true,
    shippingFeeMinor: 0,
    codCollector: 'SELLER',
    useWilayaRate: true,
  };
  assert.equal(SetSellerDeliveryRateInputSchema.safeParse(input).success, true);
  for (const patch of [
    { shippingFeeMinor: -1 },
    { shippingFeeMinor: 1.5 },
    { shippingFeeMinor: 2000000001 },
    { sellerId: randomUUID() },
    { useWilayaRate: 'true' },
    { expectedVersion: 2147483647 },
  ])
    assert.equal(SetSellerDeliveryRateInputSchema.safeParse({ ...input, ...patch }).success, false);
});
