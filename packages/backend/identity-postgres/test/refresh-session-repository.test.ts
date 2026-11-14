import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RefreshSessionRotationCommand } from '@atlas/identity';

import { PostgresRefreshSessionRepository } from '../src/index.js';
import { queryError, queryRows, ScriptedPool, ScriptedTransactionClient } from './support.js';

const sessionId = '20000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000002';
const familyId = '20000000-0000-4000-8000-000000000003';
const successorSessionId = '20000000-0000-4000-8000-000000000004';
const correlationId = '01K6E8Z5R3A7TQ2MW9VNH4JXCP';
const presentedTokenDigest = new Uint8Array(32).fill(1);
const successorTokenDigest = new Uint8Array(32).fill(2);

const command = (
  overrides: Partial<RefreshSessionRotationCommand> = {},
): RefreshSessionRotationCommand => ({
  presentedTokenDigest,
  successorSessionId,
  successorTokenDigest,
  correlationId,
  ...overrides,
});

const candidate = { sessionId, userId, familyId };
const activeState = {
  generationReuseRecorded: false,
  familyReuseRecorded: false,
  generationRotated: false,
  generationRevoked: false,
  familyRevoked: false,
  canRotate: true,
};
const binding = {
  sessionId: successorSessionId,
  familyId,
  userId,
  sessionEpoch: '1',
  actorType: 'customer',
  scopeType: 'GLOBAL',
  scopeId: null,
  assuranceLevel: 'PRIMARY',
  mfaCompletedAt: null,
  issuedAt: '2026-10-06T12:00:00.000Z',
  expiresAt: '2026-11-06T12:00:00.000Z',
};

describe('PostgresRefreshSessionRepository', () => {
  it('locks user, family, then generation and persists a derived successor plus audit', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([activeState]),
      queryRows([{ rotated_at: binding.issuedAt }]),
      queryRows([binding]),
      queryRows([{ row_version: '2' }]),
      queryRows([{ event_id: '20000000-0000-4000-8000-000000000005' }]),
      queryRows([]),
    ]);
    const pool = new ScriptedPool([queryRows([candidate])], client);

    const result = await new PostgresRefreshSessionRepository(pool).rotateOrRecordReplayAtomically(
      command(),
    );

    assert.equal(result.kind, 'ROTATED');
    if (result.kind === 'ROTATED') {
      assert.equal(result.binding.sessionId, successorSessionId);
      assert.equal(result.binding.familyId, familyId);
      assert.equal(result.binding.scope.type, 'GLOBAL');
      assert.equal(result.binding.issuedAt.toISOString(), binding.issuedAt);
    }
    assert.match(client.calls[1]?.text ?? '', /identity\.users/);
    assert.match(client.calls[2]?.text ?? '', /identity\.session_families/);
    assert.match(client.calls[3]?.text ?? '', /FOR UPDATE OF session/);
    assert.match(client.calls[5]?.text ?? '', /predecessor\.device_hash/);
    assert.match(client.calls[5]?.text ?? '', /predecessor\.mfa_completed_at/);
    assert.match(client.calls[7]?.text ?? '', /identity\.session_rotated/);
    assert.doesNotMatch(client.calls[7]?.text ?? '', /token_hash|tokenDigest|refreshToken/i);
    assert.equal(client.calls.at(-1)?.text, 'COMMIT');
    assert.equal(client.released, true);
  });

  it('records the first predecessor replay with atomic audit and both canonical events', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([{ ...activeState, generationRotated: true, canRotate: false }]),
      queryRows([{ reuse_detected_at: binding.issuedAt }]),
      queryRows([{ familyId }]),
      queryRows([]),
    ]);
    const pool = new ScriptedPool([queryRows([candidate])], client);

    const result = await new PostgresRefreshSessionRepository(pool).rotateOrRecordReplayAtomically(
      command(),
    );

    assert.deepEqual(result, { kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: true });
    const evidence = client.calls[5]?.text ?? '';
    assert.match(evidence, /identity\.refresh_reuse_detected/);
    assert.match(evidence, /'identity\.session_revoked'/);
    assert.match(evidence, /'identity\.login_suspicious'/);
    assert.match(evidence, /REFRESH_TOKEN_REUSE_DETECTED/);
    assert.doesNotMatch(evidence, /token_hash|tokenDigest|refreshToken/i);
  });

  it('makes already-recorded replay evidence a write-free success path', async () => {
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([
        {
          ...activeState,
          generationReuseRecorded: true,
          generationRotated: true,
          familyReuseRecorded: true,
          canRotate: false,
        },
      ]),
      queryRows([]),
    ]);
    const pool = new ScriptedPool([queryRows([candidate])], client);

    const result = await new PostgresRefreshSessionRepository(pool).rotateOrRecordReplayAtomically(
      command(),
    );

    assert.deepEqual(result, { kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: false });
    assert.equal(client.calls.length, 5);
    assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  });

  it('separates explicit revocation from unknown or expired credentials', async () => {
    const revokedClient = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([{ ...activeState, familyRevoked: true, canRotate: false }]),
      queryRows([]),
    ]);
    const revoked = new PostgresRefreshSessionRepository(
      new ScriptedPool([queryRows([candidate])], revokedClient),
    );
    assert.deepEqual(await revoked.rotateOrRecordReplayAtomically(command()), {
      kind: 'SESSION_REVOKED',
    });

    const expiredClient = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([{ ...activeState, canRotate: false }]),
      queryRows([]),
    ]);
    const expired = new PostgresRefreshSessionRepository(
      new ScriptedPool([queryRows([candidate])], expiredClient),
    );
    assert.deepEqual(await expired.rotateOrRecordReplayAtomically(command()), {
      kind: 'REFRESH_TOKEN_INVALID',
    });

    const missingPoolWithStep = new ScriptedPool(
      [queryRows([])],
      new ScriptedTransactionClient([]),
    );
    assert.deepEqual(
      await new PostgresRefreshSessionRepository(
        missingPoolWithStep,
      ).rotateOrRecordReplayAtomically(command()),
      { kind: 'REFRESH_TOKEN_INVALID' },
    );
    assert.equal(missingPoolWithStep.connectCount, 0);
  });

  it('rolls back replay state when evidence cannot commit', async () => {
    const failure = new Error('synthetic outbox conflict');
    const client = new ScriptedTransactionClient([
      queryRows([]),
      queryRows([{ id: userId }]),
      queryRows([{ id: familyId }]),
      queryRows([{ ...activeState, generationRotated: true, canRotate: false }]),
      queryRows([{ reuse_detected_at: binding.issuedAt }]),
      queryError(failure),
      queryRows([]),
    ]);
    const repository = new PostgresRefreshSessionRepository(
      new ScriptedPool([queryRows([candidate])], client),
    );

    await assert.rejects(repository.rotateOrRecordReplayAtomically(command()), failure);
    assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
    assert.equal(client.released, true);
  });

  it('rejects malformed successor material before looking up a credential', async () => {
    const pool = new ScriptedPool([], new ScriptedTransactionClient([]));
    const repository = new PostgresRefreshSessionRepository(pool);

    await assert.rejects(
      repository.rotateOrRecordReplayAtomically(
        command({ successorTokenDigest: new Uint8Array(31) }),
      ),
      TypeError,
    );
    assert.equal(pool.direct.calls.length, 0);
    assert.equal(pool.connectCount, 0);
  });
});
