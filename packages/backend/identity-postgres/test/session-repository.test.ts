import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SessionPersistenceContext } from '@atlas/identity';

import { PostgresSessionRepository } from '../src/index.js';
import { queryError, queryRows, ScriptedPool, ScriptedTransactionClient } from './support.js';

const userId = '20000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000002';
const currentFamilyId = '20000000-0000-4000-8000-000000000003';
const targetFamilyId = '20000000-0000-4000-8000-000000000004';
const secondFamilyId = '20000000-0000-4000-8000-000000000005';
const correlationId = '01K6E8Z5R3A7TQ2MW9VNH4JXCP';

const context: SessionPersistenceContext = Object.freeze({
  ownerUserId: userId,
  actor: Object.freeze({
    type: 'customer',
    id: userId,
    sessionId,
    effectiveRoleCodes: Object.freeze(['CUSTOMER']),
    scope: Object.freeze({ type: 'GLOBAL' }),
    assuranceLevel: 'PRIMARY',
  }),
  currentFamilyId,
  correlationId,
});

const ownerRow = { id: userId };
const familyRow = { id: targetFamilyId };
const revokedRow = { familyId: targetFamilyId, sessionCount: '1' };

describe('PostgresSessionRepository', () => {
  it('lists only active current generations and maps stable family records', async () => {
    const client = new ScriptedTransactionClient([]);
    const pool = new ScriptedPool(
      [
        queryRows([
          {
            familyId: currentFamilyId,
            deviceLabel: 'Synthetic browser',
            actorType: 'customer',
            scopeType: 'GLOBAL',
            scopeId: null,
            assuranceLevel: 'PRIMARY',
            createdAt: '2026-10-01T08:00:00.000Z',
            lastSeenAt: '2026-10-04T09:00:00.000Z',
            expiresAt: '2026-11-01T08:00:00.000Z',
          },
        ]),
      ],
      client,
    );
    const repository = new PostgresSessionRepository(pool);

    const families = await repository.listCurrentFamilies(context);

    assert.equal(families.length, 1);
    assert.equal(families[0]?.familyId, currentFamilyId);
    assert.equal(families[0]?.createdAt.toISOString(), '2026-10-01T08:00:00.000Z');
    assert.deepEqual(pool.direct.calls[0]?.values, [userId]);
    assert.match(pool.direct.calls[0]?.text ?? '', /identity\.session_families/);
    assert.match(pool.direct.calls[0]?.text ?? '', /rotated_at IS NULL/);
    assert.match(pool.direct.calls[0]?.text ?? '', /expires_at > transaction_timestamp\(\)/);
    assert.equal(pool.connectCount, 0);
  });

  it('returns the same not-found result for an unowned or nonexistent family', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([]),
      queryRows([]),
    ]);
    const pool = new ScriptedPool([], client);
    const repository = new PostgresSessionRepository(pool);

    const result = await repository.revokeOwnedFamilyAtomically(context, targetFamilyId);

    assert.deepEqual(result, { found: false });
    assert.deepEqual(
      client.calls.map((call) => call.text.trim().split('\n')[0]),
      ['BEGIN', 'SELECT id::text AS "id"', 'SELECT id::text AS "id"', 'COMMIT'],
    );
    assert.equal(client.released, true);
  });

  it('makes a repeated revocation idempotent without duplicate evidence or events', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([familyRow]),
      queryRows([]),
      queryRows([]),
    ]);
    const repository = new PostgresSessionRepository(new ScriptedPool([], client));

    const result = await repository.revokeOwnedFamilyAtomically(context, targetFamilyId);

    assert.deepEqual(result, {
      found: true,
      counts: { revokedFamilyCount: 0, revokedSessionCount: 0 },
    });
    assert.match(client.calls[3]?.text ?? '', /revoked_at IS NULL/);
    assert.equal(
      client.calls.filter((call) => call.text.includes('platform.audit_events')).length,
      1,
    );
  });

  it('atomically revokes an owned current family with one audit and canonical outbox event', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([familyRow]),
      queryRows([revokedRow]),
      queryRows([]),
    ]);
    const repository = new PostgresSessionRepository(new ScriptedPool([], client));

    const result = await repository.revokeOwnedFamilyAtomically(context, targetFamilyId);

    assert.deepEqual(result, {
      found: true,
      counts: { revokedFamilyCount: 1, revokedSessionCount: 1 },
    });
    const mutation = client.calls[3];
    assert.match(mutation?.text ?? '', /SELECT clock_timestamp\(\) AS occurred_at/);
    assert.doesNotMatch(mutation?.text ?? '', /transaction_timestamp\(\)/);
    assert.match(mutation?.text ?? '', /UPDATE identity\.session_families/);
    assert.match(mutation?.text ?? '', /UPDATE identity\.sessions/);
    assert.match(mutation?.text ?? '', /family\.id = \$8::uuid/);
    assert.match(mutation?.text ?? '', /INSERT INTO platform\.audit_events/);
    assert.match(mutation?.text ?? '', /INSERT INTO platform\.outbox_events/);
    assert.match(mutation?.text ?? '', /'identity\.session_revoked'/);
    assert.match(mutation?.text ?? '', /'session_family'/);
    assert.match(mutation?.text ?? '', /'sessionId', family\.id/);
    assert.doesNotMatch(mutation?.text ?? '', /identity\.session_revoked\.v1/);
    assert.equal(mutation?.values[7], targetFamilyId);
    assert.equal(mutation?.values[9], 'USER_REQUESTED');
    assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  });

  it('revokes other owned families while excluding the authenticated current family', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([familyRow]),
      queryRows([revokedRow, { familyId: secondFamilyId, sessionCount: '1' }]),
      queryRows([]),
    ]);
    const repository = new PostgresSessionRepository(new ScriptedPool([], client));

    const result = await repository.revokeOtherFamiliesAtomically(context);

    assert.deepEqual(result, { revokedFamilyCount: 2, revokedSessionCount: 2 });
    const mutation = client.calls[3];
    assert.match(mutation?.text ?? '', /family\.id <> \$8::uuid/);
    assert.equal(mutation?.values[7], currentFamilyId);
    assert.equal(mutation?.values[9], 'OTHER_SESSIONS_REVOKED');
  });

  it('rolls back and releases the client when an atomic mutation fails', async () => {
    const writeFailure = new Error('synthetic write failure');
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([familyRow]),
      queryError(writeFailure),
      queryRows([]),
    ]);
    const repository = new PostgresSessionRepository(new ScriptedPool([], client));

    await assert.rejects(
      repository.revokeOwnedFamilyAtomically(context, targetFamilyId),
      writeFailure,
    );
    assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
    assert.equal(client.released, true);
  });

  it('surfaces both the write and rollback failures while still releasing the client', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([ownerRow]),
      queryRows([familyRow]),
      queryError(new Error('synthetic write failure')),
      queryError(new Error('synthetic rollback failure')),
    ]);
    const repository = new PostgresSessionRepository(new ScriptedPool([], client));

    await assert.rejects(
      repository.revokeOwnedFamilyAtomically(context, targetFamilyId),
      AggregateError,
    );
    assert.equal(client.released, true);
  });

  it('does not open a transaction for a malformed target family identifier', async () => {
    const client = new ScriptedTransactionClient([]);
    const pool = new ScriptedPool([], client);
    const repository = new PostgresSessionRepository(pool);

    assert.deepEqual(await repository.revokeOwnedFamilyAtomically(context, 'not-a-uuid'), {
      found: false,
    });
    assert.equal(pool.connectCount, 0);
  });
});
