import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerCartSchema, SetCartItemInputSchema } from '@atlas/contracts';
import { PostgresCartRepository } from '../src/index.js';
import type { Pool } from 'pg';

describe('customer cart input boundary', () => {
  it('bounds quantities, versions and authority fields', () => {
    for (const quantity of [-1, 0.5, 100, NaN])
      assert.equal(
        SetCartItemInputSchema.safeParse({ quantity, expectedVersion: 0 }).success,
        false,
      );
    for (const expectedVersion of [-1, 0.5, 2_147_483_647])
      assert.equal(
        SetCartItemInputSchema.safeParse({ quantity: 1, expectedVersion }).success,
        false,
      );
    assert.equal(
      SetCartItemInputSchema.safeParse({ quantity: 1, expectedVersion: 0, customerId: 'other' })
        .success,
      false,
    );
    assert.deepEqual(SetCartItemInputSchema.parse({ quantity: 0, expectedVersion: 1 }), {
      quantity: 0,
      expectedVersion: 1,
    });
  });
  it('rejects invalid identifiers before database access', async () => {
    const repository = new PostgresCartRepository({
      connect: () => {
        throw new Error('Database must not be called');
      },
    } as unknown as Pool);
    await assert.rejects(repository.getCart('not-a-user'));
    await assert.rejects(
      repository.setItem('not-a-user', 'not-an-offer', { quantity: 1, expectedVersion: 0 }),
    );
  });
  it('defines an empty cart without a payment or reservation claim', () => {
    assert.deepEqual(
      CustomerCartSchema.parse({
        version: 0,
        items: [],
        currency: 'DZD',
        availableSubtotalMinor: 0,
      }),
      { version: 0, items: [], currency: 'DZD', availableSubtotalMinor: 0 },
    );
    assert.equal(
      CustomerCartSchema.safeParse({
        version: 0,
        items: [],
        currency: 'DZD',
        availableSubtotalMinor: 0,
        paid: true,
      }).success,
      false,
    );
  });
});
