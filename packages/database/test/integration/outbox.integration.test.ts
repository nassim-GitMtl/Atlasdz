import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Client, Pool } from 'pg';
import { runMigrations } from '../../src/migrations.js';
import { PostgresOutboxQueue, type OutboxClaim } from '../../src/outbox-queue.js';

const policy = { maxAttempts: 3, leaseMs: 30_000, baseDelayMs: 10_000, maxDelayMs: 20_000 };

describe('durable outbox queue', () => {
  const source = process.env['DATABASE_URL'];
  if (!source) throw new Error('DATABASE_URL is required for outbox integration tests');
  const adminUrl = new URL(source);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname))
    throw new Error('Outbox integration tests require loopback PostgreSQL');
  const name = `atlas_outbox_it_${randomBytes(8).toString('hex')}`;
  const testUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  testUrl.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  let pool: Pool;
  let queue: PostgresOutboxQueue;

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await runMigrations(testUrl.toString());
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 });
    queue = new PostgresOutboxQueue(pool, 'outbox-test', policy);
  });
  after(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  beforeEach(async () => {
    // Only the freshly created disposable test database is touched.
    await pool.query('DELETE FROM platform.outbox_events');
  });

  const insertSql = `INSERT INTO platform.outbox_events (
    event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
    aggregate_version, payload, actor_type, actor_id, correlation_id
  ) VALUES ($1, $2, 1, 'atlas-test', 'test-aggregate', $3, $4,
    '{"synthetic":true}', 'anonymous', NULL, $5)`;
  async function insert(aggregateId = randomUUID(), version = '1', type = 'test.created') {
    const id = randomUUID();
    await pool.query(insertSql, [id, type, aggregateId, version, randomUUID()]);
    return id;
  }
  async function firstClaim(): Promise<OutboxClaim> {
    const rows = await queue.claim(1);
    assert.equal(rows.length, 1);
    assert.ok(rows[0]);
    return rows[0];
  }
  async function due(id: string) {
    await pool.query(
      "UPDATE platform.outbox_events SET available_at = clock_timestamp() - interval '1 second' WHERE event_id = $1",
      [id],
    );
  }
  async function expire(id: string) {
    await pool.query(
      "UPDATE platform.outbox_events SET locked_until = clock_timestamp() - interval '1 second' WHERE event_id = $1",
      [id],
    );
  }

  it('never claims uncommitted events and preserves bigint envelope values exactly', async () => {
    const producer = await pool.connect();
    try {
      await producer.query('BEGIN');
      const id = randomUUID();
      await producer.query(insertSql, [
        id,
        'test.created',
        randomUUID(),
        '9007199254740993',
        randomUUID(),
      ]);
      assert.deepEqual(await queue.claim(), []);
      await producer.query('COMMIT');
      const claim = await firstClaim();
      assert.equal(claim.eventId, id);
      assert.equal(claim.aggregateVersion, '9007199254740993');
      assert.deepEqual(claim.data, { synthetic: true });
      assert.equal(claim.actorType, 'anonymous');
      assert.equal(claim.actorId, null);
      assert.equal(await queue.acknowledge(claim), true);
      const persisted = await pool.query(
        'SELECT delivery_state, published_at, payload FROM platform.outbox_events WHERE event_id = $1',
        [id],
      );
      assert.equal(persisted.rows[0].delivery_state, 'PUBLISHED');
      assert.ok(persisted.rows[0].published_at instanceof Date);
      assert.deepEqual(persisted.rows[0].payload, { synthetic: true });
      assert.deepEqual(await queue.claim(), []);
      await assert.rejects(
        pool.query("UPDATE platform.outbox_events SET payload = '{}' WHERE event_id = $1", [id]),
        /envelope is immutable/,
      );
    } finally {
      await producer.query('ROLLBACK');
      producer.release();
    }
  });

  it('gives concurrent workers disjoint leases without double-counting attempts', async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => insert()));
    const other = new PostgresOutboxQueue(pool, 'other-worker', policy);
    const claimed = (await Promise.all([queue.claim(6), other.claim(6)])).flat();
    assert.equal(claimed.length, 12);
    assert.deepEqual(new Set(claimed.map((item) => item.eventId)), new Set(ids));
    assert.ok(claimed.every((item) => item.attempt === 1));
    assert.deepEqual(await queue.claim(), []);
    assert.ok((await Promise.all(claimed.map((item) => queue.acknowledge(item)))).every(Boolean));
  });

  it('orders each aggregate, including tied versions, while unrelated aggregates progress', async () => {
    const aggregate = randomUUID();
    const second = await insert(aggregate, '1', 'test.b');
    const first = await insert(aggregate, '1', 'test.a');
    const third = await insert(aggregate, '2');
    const unrelated = await insert();
    const claims = await queue.claim();
    assert.deepEqual(new Set(claims.map((item) => item.eventId)), new Set([first, unrelated]));
    const firstLease = claims.find((item) => item.eventId === first);
    assert.ok(firstLease);
    assert.equal(await queue.fail(firstLease, 'BROKER_UNAVAILABLE', true), true);
    assert.deepEqual(await queue.claim(), []);
    await due(first);
    assert.equal(await queue.acknowledge(await firstClaim()), true);
    const secondLease = await firstClaim();
    assert.equal(secondLease.eventId, second);
    assert.equal(await queue.fail(secondLease, 'INVALID_EVENT', false), true);
    assert.deepEqual(await queue.claim(), []);
    const pending = await pool.query(
      'SELECT attempt_count FROM platform.outbox_events WHERE event_id = $1',
      [third],
    );
    assert.equal(pending.rows[0].attempt_count, 0);
    const newUnrelated = await insert();
    assert.equal((await firstClaim()).eventId, newUnrelated);
  });

  it('persists capped backoff with jitter and parks exhausted retries without exception details', async () => {
    const id = await insert();
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      const claim = await firstClaim();
      assert.equal(claim.attempt, attempt);
      const beforeFailure = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      assert.equal(await queue.fail(claim, 'BROKER_UNAVAILABLE', true), true);
      const afterFailure = await pool.query(
        'SELECT delivery_state, available_at, last_error_detail, locked_by, published_at FROM platform.outbox_events WHERE event_id = $1',
        [id],
      );
      const row = afterFailure.rows[0];
      assert.equal(row.last_error_detail, null);
      assert.equal(row.locked_by, null);
      assert.equal(row.published_at, null);
      assert.deepEqual(await queue.claim(), []);
      if (attempt < policy.maxAttempts) {
        assert.equal(row.delivery_state, 'PENDING');
        const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
        const before = beforeFailure.rows[0];
        assert.ok(before);
        const delay = row.available_at.getTime() - before.now.getTime();
        assert.ok(delay >= ceiling / 2 && delay <= ceiling + 1000);
        await due(id);
      } else assert.equal(row.delivery_state, 'FAILED');
    }
    const restarted = new PostgresOutboxQueue(pool, 'restarted-worker', policy);
    assert.deepEqual(await restarted.claim(), []);
    const failed = await restarted.listFailed();
    assert.equal(failed.length, 1);
    assert.equal(failed[0]?.eventId, id);
    assert.equal(failed[0]?.errorCode, 'BROKER_UNAVAILABLE');
    assert.equal(failed[0]?.attempt, 3);
    assert.ok(failed[0]);
    assert.deepEqual(Object.keys(failed[0]).sort(), [
      'attempt',
      'correlationId',
      'errorCode',
      'eventId',
      'eventType',
    ]);
  });

  it('fences expired and replaced leases even when the same worker name is reused', async () => {
    const id = await insert();
    const stale = await firstClaim();
    await expire(id);
    assert.equal(await queue.acknowledge(stale), false);
    assert.equal(await queue.fail(stale, 'BROKER_TIMEOUT', true), false);
    const resumed = new PostgresOutboxQueue(pool, 'outbox-test', policy);
    const replacement = (await resumed.claim())[0];
    assert.ok(replacement);
    assert.notEqual(replacement.leaseToken, stale.leaseToken);
    assert.equal(replacement.attempt, 2);
    assert.equal(await queue.acknowledge(stale), false);
    assert.equal(await queue.fail(stale, 'INVALID_EVENT', false), false);
    assert.equal(await resumed.acknowledge(replacement), true);
    assert.equal(await resumed.acknowledge(replacement), false);
    assert.equal(await resumed.fail(replacement, 'PUBLISH_REJECTED', false), false);
  });

  it('recovers a crash on the final attempt without stealing a live lease or releasing successors', async () => {
    const finalQueue = new PostgresOutboxQueue(pool, 'one-attempt-worker', {
      ...policy,
      maxAttempts: 1,
    });
    const aggregate = randomUUID();
    const id = await insert(aggregate);
    await insert(aggregate, '2');
    assert.equal((await finalQueue.claim())[0]?.eventId, id);
    assert.deepEqual(await finalQueue.claim(), []);
    assert.deepEqual(await finalQueue.listFailed(), []);
    await expire(id);
    assert.deepEqual(await finalQueue.claim(), []);
    assert.equal((await finalQueue.listFailed())[0]?.errorCode, 'LEASE_EXHAUSTED');
  });

  it('skips an externally locked row and bounds batches while allowing another aggregate through', async () => {
    const id = await insert();
    const free = await insert();
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT event_id FROM platform.outbox_events WHERE event_id = $1 FOR UPDATE',
        [id],
      );
      assert.equal((await queue.claim(1))[0]?.eventId, free);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    assert.equal((await firstClaim()).eventId, id);
  });
});
