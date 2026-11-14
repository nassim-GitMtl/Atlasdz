import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RefreshSession,
  type RefreshSessionRepositoryPort,
  type RefreshSessionRotationCommand,
  type RefreshSessionRotationResult,
} from '../src/index.js';

const successorSessionId = '20000000-0000-4000-8000-000000000002';
const correlationId = '01K6E8Z5R3A7TQ2MW9VNH4JXCP';

const command = (): RefreshSessionRotationCommand => ({
  presentedTokenDigest: new Uint8Array(32).fill(1),
  successorSessionId,
  successorTokenDigest: new Uint8Array(32).fill(2),
  correlationId,
});

class InMemoryRefreshSessionRepository implements RefreshSessionRepositoryPort {
  public readonly calls: RefreshSessionRotationCommand[] = [];
  public result: RefreshSessionRotationResult = { kind: 'REFRESH_TOKEN_INVALID' };

  public async rotateOrRecordReplayAtomically(
    input: RefreshSessionRotationCommand,
  ): Promise<RefreshSessionRotationResult> {
    this.calls.push(input);
    return this.result;
  }
}

describe('RefreshSession', () => {
  it('copies fixed-width verifier digests before crossing the persistence boundary', async () => {
    const repository = new InMemoryRefreshSessionRepository();
    repository.result = { kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: true };
    const input = command();

    const result = await new RefreshSession(repository).execute(input);

    assert.deepEqual(result, { kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: true });
    assert.equal(repository.calls.length, 1);
    assert.notEqual(repository.calls[0]?.presentedTokenDigest, input.presentedTokenDigest);
    assert.notEqual(repository.calls[0]?.successorTokenDigest, input.successorTokenDigest);
    assert.deepEqual(repository.calls[0]?.presentedTokenDigest, input.presentedTokenDigest);
    assert.deepEqual(repository.calls[0]?.successorTokenDigest, input.successorTokenDigest);
  });

  it('preserves every persistence outcome without inventing credential state', async () => {
    const outcomes: RefreshSessionRotationResult[] = [
      { kind: 'REFRESH_TOKEN_INVALID' },
      { kind: 'SESSION_REVOKED' },
      { kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: false },
    ];

    for (const outcome of outcomes) {
      const repository = new InMemoryRefreshSessionRepository();
      repository.result = outcome;
      assert.deepEqual(await new RefreshSession(repository).execute(command()), outcome);
    }
  });

  it('rejects malformed or unsafe commands before persistence', async () => {
    const invalidCommands: RefreshSessionRotationCommand[] = [
      { ...command(), successorSessionId: 'not-a-uuid' },
      { ...command(), correlationId: 'lowercaseulidisnotaccepted00' },
      { ...command(), presentedTokenDigest: new Uint8Array(31) },
      { ...command(), successorTokenDigest: new Uint8Array(33) },
      {
        ...command(),
        successorTokenDigest: new Uint8Array(command().presentedTokenDigest),
      },
    ];

    for (const invalid of invalidCommands) {
      const repository = new InMemoryRefreshSessionRepository();
      await assert.rejects(new RefreshSession(repository).execute(invalid), TypeError);
      assert.equal(repository.calls.length, 0);
    }
  });
});
