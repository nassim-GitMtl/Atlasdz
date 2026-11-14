import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { contact } from './delivery-contact.fixture.js';
import {
  OrderWriteError,
  PostgresOrderRepository,
  validateSyntheticCheckoutPolicy,
  type SyntheticCheckoutPolicy,
} from '../src/index.js';

describe('synthetic checkout policy boundary', () => {
  const policy: SyntheticCheckoutPolicy = {
    environment: 'local',
    customerId: randomUUID(),
    quoteLifetimeSeconds: 600,
    acceptanceWindowSeconds: 3600,
  };
  it('requires explicit LOCAL/TEST configuration with bounded deadlines', () => {
    validateSyntheticCheckoutPolicy(policy);
    for (const invalid of [
      { ...policy, environment: 'production' },
      { ...policy, environment: 'staging' },
      { ...policy, quoteLifetimeSeconds: 0 },
      { ...policy, acceptanceWindowSeconds: 86401 },
      { ...policy, quoteLifetimeSeconds: 1.5 },
    ])
      assert.throws(() => validateSyntheticCheckoutPolicy(invalid as SyntheticCheckoutPolicy));
  });
  it('fails closed without a policy or for another customer before database access', async () => {
    const pool = {
      connect: () => {
        throw new Error('Database must not be accessed');
      },
    } as unknown as Pool;
    const disabled = new PostgresOrderRepository(pool);
    await assert.rejects(
      disabled.createQuote(policy.customerId, 1, randomUUID(), contact),
      (error: unknown) => error instanceof OrderWriteError && error.code === 'CHECKOUT_DISABLED',
    );
    await assert.rejects(
      disabled.place(policy.customerId, randomUUID(), randomUUID()),
      (error: unknown) => error instanceof OrderWriteError && error.code === 'CHECKOUT_DISABLED',
    );
    await assert.rejects(
      new PostgresOrderRepository(pool, policy).createQuote(randomUUID(), 1, randomUUID(), contact),
      (error: unknown) => error instanceof OrderWriteError && error.code === 'CHECKOUT_DISABLED',
    );
  });
});
