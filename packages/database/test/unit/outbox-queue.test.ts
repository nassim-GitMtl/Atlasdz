import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { Pool } from 'pg';
import {
  PostgresOutboxQueue,
  type OutboxClaim,
  type OutboxFailureCode,
} from '../../src/outbox-queue.js';

const pool = {
  query: async () => assert.fail('Invalid arguments must not reach PostgreSQL'),
} as unknown as Pool;
const policy = { maxAttempts: 3, leaseMs: 30_000, baseDelayMs: 1000, maxDelayMs: 60_000 };

it('rejects invalid queue configuration before accessing PostgreSQL', () => {
  for (const worker of ['', 'secret value', 'a'.repeat(81)])
    assert.throws(() => new PostgresOutboxQueue(pool, worker, policy));
  for (const override of [
    { maxAttempts: 0 },
    { maxAttempts: 101 },
    { maxAttempts: 1.5 },
    { leaseMs: 0 },
    { leaseMs: Infinity },
    { baseDelayMs: -1 },
    { maxDelayMs: 999 },
    { maxDelayMs: NaN },
    { maxDelayMs: 3_600_001 },
  ])
    assert.throws(() => new PostgresOutboxQueue(pool, 'test-worker', { ...policy, ...override }));
});

it('rejects unbounded batches and raw provider failures before accessing PostgreSQL', async () => {
  const queue = new PostgresOutboxQueue(pool, 'test-worker', policy);
  for (const limit of [0, -1, 101, 1.5, NaN, Infinity]) {
    await assert.rejects(queue.claim(limit));
    await assert.rejects(queue.listFailed(limit));
  }
  await assert.rejects(
    queue.fail({} as OutboxClaim, 'Provider-secret-detail' as OutboxFailureCode, true),
  );
  await assert.rejects(queue.fail({ attempt: 0 } as OutboxClaim, 'BROKER_TIMEOUT', true));
});
