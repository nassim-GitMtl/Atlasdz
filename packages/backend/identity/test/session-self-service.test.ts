import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SessionSelfService,
  type RevokeOwnedSessionFamilyPersistenceResult,
  type SessionFamilyRecord,
  type SessionPersistenceContext,
  type SessionRevocationCounts,
  type SessionSelfServiceContext,
  type SessionSelfServicePort,
} from '../src/index.js';
import { OTHER_SELLER_SCOPE, SELLER_SCOPE, makePrincipal } from './support.js';

type PortCall =
  | Readonly<{ operation: 'list'; context: SessionPersistenceContext }>
  | Readonly<{
      operation: 'revoke-one';
      context: SessionPersistenceContext;
      targetFamilyId: string;
    }>
  | Readonly<{ operation: 'revoke-others'; context: SessionPersistenceContext }>;

class InMemorySessionSelfServicePort implements SessionSelfServicePort {
  public readonly calls: PortCall[] = [];

  public families: readonly SessionFamilyRecord[] = [];
  public revokeOneResult: RevokeOwnedSessionFamilyPersistenceResult = {
    found: true,
    counts: { revokedFamilyCount: 1, revokedSessionCount: 1 },
  };
  public revokeOthersResult: SessionRevocationCounts = {
    revokedFamilyCount: 0,
    revokedSessionCount: 0,
  };

  public async listCurrentFamilies(
    context: SessionPersistenceContext,
  ): Promise<readonly SessionFamilyRecord[]> {
    this.calls.push({ operation: 'list', context });
    return this.families;
  }

  public async revokeOwnedFamilyAtomically(
    context: SessionPersistenceContext,
    targetFamilyId: string,
  ): Promise<RevokeOwnedSessionFamilyPersistenceResult> {
    this.calls.push({ operation: 'revoke-one', context, targetFamilyId });
    return this.revokeOneResult;
  }

  public async revokeOtherFamiliesAtomically(
    context: SessionPersistenceContext,
  ): Promise<SessionRevocationCounts> {
    this.calls.push({ operation: 'revoke-others', context });
    return this.revokeOthersResult;
  }
}

const serviceContext = (): SessionSelfServiceContext => ({
  principal: makePrincipal(),
  correlation: { correlationId: '01J9QX4T7B3H5K8M2N6P0R1S4V' },
});

const family = (
  familyId: string,
  overrides: Partial<SessionFamilyRecord> = {},
): SessionFamilyRecord => ({
  familyId,
  deviceLabel: 'Firefox on Linux',
  actorType: 'seller_user',
  scope: SELLER_SCOPE,
  assuranceLevel: 'MFA',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  lastSeenAt: new Date('2026-10-04T15:55:00.000Z'),
  expiresAt: new Date('2026-11-01T10:00:00.000Z'),
  ...overrides,
});

const expectedPersistenceContext = (): SessionPersistenceContext => ({
  ownerUserId: makePrincipal().userId,
  actor: {
    type: makePrincipal().actorType,
    id: makePrincipal().userId,
    sessionId: makePrincipal().sessionId,
    effectiveRoleCodes: makePrincipal().roleCodes,
    scope: makePrincipal().scope,
    assuranceLevel: makePrincipal().assuranceLevel,
  },
  currentFamilyId: makePrincipal().sessionFamilyId,
  correlationId: serviceContext().correlation.correlationId,
});

describe('SessionSelfService', () => {
  it('lists owned active families and derives current-family state from the principal', async () => {
    const port = new InMemorySessionSelfServicePort();
    const currentRecord = family(makePrincipal().sessionFamilyId);
    const otherRecord = family('66666666-6666-4666-8666-666666666666', {
      deviceLabel: 'Atlas mobile app',
      scope: OTHER_SELLER_SCOPE,
    });
    port.families = [currentRecord, otherRecord];

    const result = await new SessionSelfService(port).listCurrentFamilies(serviceContext());

    assert.deepEqual(
      result.families.map(({ familyId, isCurrent }) => ({ familyId, isCurrent })),
      [
        { familyId: currentRecord.familyId, isCurrent: true },
        { familyId: otherRecord.familyId, isCurrent: false },
      ],
    );
    assert.deepEqual(port.calls, [{ operation: 'list', context: expectedPersistenceContext() }]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.families), true);
    assert.equal(Object.isFrozen(result.families[0]), true);
    assert.notEqual(result.families[0]?.createdAt, currentRecord.createdAt);
  });

  it('delegates owned-family revocation with actor, current-family, and correlation context', async () => {
    const port = new InMemorySessionSelfServicePort();
    port.revokeOneResult = {
      found: true,
      counts: { revokedFamilyCount: 1, revokedSessionCount: 3 },
    };
    const targetFamilyId = '66666666-6666-4666-8666-666666666666';

    const result = await new SessionSelfService(port).revokeFamily(
      serviceContext(),
      targetFamilyId,
    );

    assert.deepEqual(result, {
      ok: true,
      counts: { revokedFamilyCount: 1, revokedSessionCount: 3 },
    });
    assert.deepEqual(port.calls, [
      {
        operation: 'revoke-one',
        context: expectedPersistenceContext(),
        targetFamilyId,
      },
    ]);
    assert.equal(Object.isFrozen(result), true);
    if (result.ok) {
      assert.equal(Object.isFrozen(result.counts), true);
    }
  });

  it('maps a missing or non-owned family to the same SESSION_NOT_FOUND result', async () => {
    const port = new InMemorySessionSelfServicePort();
    port.revokeOneResult = { found: false };

    const result = await new SessionSelfService(port).revokeFamily(
      serviceContext(),
      'untrusted-public-family-id',
    );

    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' });
  });

  it('preserves successful zero counts for an idempotent owned-family replay', async () => {
    const port = new InMemorySessionSelfServicePort();
    port.revokeOneResult = {
      found: true,
      counts: { revokedFamilyCount: 0, revokedSessionCount: 0 },
    };

    const result = await new SessionSelfService(port).revokeFamily(
      serviceContext(),
      'previously-revoked-owned-family',
    );

    assert.deepEqual(result, {
      ok: true,
      counts: { revokedFamilyCount: 0, revokedSessionCount: 0 },
    });
  });

  it('revokes all other families while always preserving the principal current-family context', async () => {
    const port = new InMemorySessionSelfServicePort();
    port.revokeOthersResult = { revokedFamilyCount: 2, revokedSessionCount: 4 };

    const result = await new SessionSelfService(port).revokeOtherFamilies(serviceContext());

    assert.deepEqual(result, {
      ok: true,
      counts: { revokedFamilyCount: 2, revokedSessionCount: 4 },
    });
    assert.deepEqual(port.calls, [
      { operation: 'revoke-others', context: expectedPersistenceContext() },
    ]);
  });

  it('returns success with zero counts when there are no other live families', async () => {
    const port = new InMemorySessionSelfServicePort();

    const result = await new SessionSelfService(port).revokeOtherFamilies(serviceContext());

    assert.deepEqual(result, {
      ok: true,
      counts: { revokedFamilyCount: 0, revokedSessionCount: 0 },
    });
  });
});
