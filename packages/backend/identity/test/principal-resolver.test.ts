import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PrincipalResolver,
  type IdentityAuthorizationSnapshot,
  type PrincipalResolutionFailureCode,
  type PrincipalResolutionResult,
  type SessionFamilyIdentityRecord,
  type SessionIdentityRecord,
  type VerifiedAccessClaims,
} from '../src/index.js';
import {
  FixedClock,
  GLOBAL_SCOPE,
  InMemoryAuthorizationRepository,
  NOW,
  OTHER_SELLER_SCOPE,
  SELLER_SCOPE,
  makeClaims,
  makeSnapshot,
} from './support.js';

const expectFailure = (
  result: PrincipalResolutionResult,
  code: PrincipalResolutionFailureCode,
): void => {
  if (result.ok) {
    assert.fail(`Expected ${code}, received a principal`);
  }
  assert.equal(result.code, code);
};

const resolve = async (
  snapshot: IdentityAuthorizationSnapshot,
  claims: VerifiedAccessClaims = makeClaims(),
  clock: FixedClock = new FixedClock(),
): Promise<PrincipalResolutionResult> => {
  const repository = new InMemoryAuthorizationRepository(snapshot);
  return new PrincipalResolver(repository, clock).resolve(claims);
};

const sessionFrom = (snapshot: IdentityAuthorizationSnapshot): SessionIdentityRecord => {
  if (snapshot.session === null) {
    assert.fail('Test fixture must contain a session');
  }
  return snapshot.session;
};

const familyFrom = (snapshot: IdentityAuthorizationSnapshot): SessionFamilyIdentityRecord => {
  if (snapshot.sessionFamily === null) {
    assert.fail('Test fixture must contain a session family');
  }
  return snapshot.sessionFamily;
};

const firstFrom = <T>(values: readonly T[]): T => {
  const value = values[0];
  if (value === undefined) {
    assert.fail('Test fixture collection must not be empty');
  }
  return value;
};

describe('PrincipalResolver', () => {
  it('constructs an immutable principal only from current repository grants', async () => {
    const snapshot = makeSnapshot();
    const repository = new InMemoryAuthorizationRepository({
      ...snapshot,
      rolePermissionGrants: [
        ...snapshot.rolePermissionGrants,
        {
          id: 'role-permission-revoked',
          roleId: 'role-1',
          permissionId: 'permission-revoked',
          grantedAt: new Date('2026-10-03T16:00:00.000Z'),
          validUntil: null,
          revokedAt: new Date('2026-10-04T15:00:00.000Z'),
        },
        {
          id: 'role-permission-future',
          roleId: 'role-1',
          permissionId: 'permission-future',
          grantedAt: new Date('2026-10-05T16:00:00.000Z'),
          validUntil: null,
          revokedAt: null,
        },
        {
          id: 'role-permission-expired',
          roleId: 'role-1',
          permissionId: 'permission-expired',
          grantedAt: new Date('2026-10-01T16:00:00.000Z'),
          validUntil: new Date('2026-10-04T16:00:00.000Z'),
          revokedAt: null,
        },
        {
          id: 'role-permission-deprecated',
          roleId: 'role-1',
          permissionId: 'permission-deprecated',
          grantedAt: new Date('2026-10-03T16:00:00.000Z'),
          validUntil: null,
          revokedAt: null,
        },
      ],
      permissions: [
        ...snapshot.permissions,
        { id: 'permission-revoked', code: 'orders.cancel', status: 'ACTIVE' },
        { id: 'permission-future', code: 'orders.create', status: 'ACTIVE' },
        { id: 'permission-expired', code: 'orders.update', status: 'ACTIVE' },
        { id: 'permission-deprecated', code: 'orders.export', status: 'DEPRECATED' },
      ],
    });

    const result = await new PrincipalResolver(repository, new FixedClock()).resolve(makeClaims());

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.principal.roleCodes, ['SELLER_OPERATOR']);
    assert.deepEqual(result.principal.permissionGrants, [
      { permission: 'orders.read', scope: SELLER_SCOPE },
    ]);
    assert.equal(Object.isFrozen(result.principal), true);
    assert.equal(Object.isFrozen(result.principal.permissionGrants), true);
    assert.deepEqual(repository.calls, [
      {
        userId: makeClaims().userId,
        sessionId: makeClaims().sessionId,
      },
    ]);
  });

  it('rejects invalid, not-yet-active, and expired access-token time windows before storage', async () => {
    const cases: ReadonlyArray<
      readonly [string, VerifiedAccessClaims, PrincipalResolutionFailureCode]
    > = [
      [
        'invalid range',
        {
          ...makeClaims(),
          expiresAt: new Date('2026-10-04T15:50:00.000Z'),
        },
        'ACCESS_TOKEN_TIME_INVALID',
      ],
      [
        'future token',
        {
          ...makeClaims(),
          issuedAt: new Date('2026-10-04T16:01:00.000Z'),
          expiresAt: new Date('2026-10-04T16:10:00.000Z'),
        },
        'ACCESS_TOKEN_NOT_ACTIVE',
      ],
      [
        'expired token',
        {
          ...makeClaims(),
          expiresAt: new Date(NOW),
        },
        'ACCESS_TOKEN_EXPIRED',
      ],
    ];

    for (const [label, claims, code] of cases) {
      const repository = new InMemoryAuthorizationRepository(makeSnapshot());
      const result = await new PrincipalResolver(repository, new FixedClock()).resolve(claims);
      expectFailure(result, code);
      assert.equal(repository.calls.length, 0, label);
    }
  });

  it('requires an existing active user', async () => {
    const missing = await resolve({ ...makeSnapshot(), user: null });
    expectFailure(missing, 'USER_NOT_FOUND');

    for (const status of ['PENDING', 'LOCKED', 'DISABLED'] as const) {
      const snapshot = makeSnapshot();
      const inactive = await resolve({
        ...snapshot,
        user: snapshot.user === null ? null : { ...snapshot.user, status },
      });
      expectFailure(inactive, 'USER_INACTIVE');
    }
  });

  it('rejects missing sessions and every credential-to-session binding mismatch', async () => {
    expectFailure(await resolve({ ...makeSnapshot(), session: null }), 'SESSION_NOT_FOUND');

    const cases: ReadonlyArray<
      readonly [IdentityAuthorizationSnapshot, VerifiedAccessClaims, PrincipalResolutionFailureCode]
    > = [
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), userId: 'different-user' },
        },
        makeClaims(),
        'SESSION_OWNERSHIP_MISMATCH',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), familyId: 'different-family' },
        },
        makeClaims(),
        'SESSION_FAMILY_MISMATCH',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), sessionEpoch: 8 },
        },
        makeClaims(),
        'SESSION_EPOCH_MISMATCH',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), actorType: 'staff' },
        },
        makeClaims(),
        'SESSION_ACTOR_MISMATCH',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), scope: OTHER_SELLER_SCOPE },
        },
        makeClaims(),
        'SESSION_SCOPE_MISMATCH',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...sessionFrom(makeSnapshot()), assuranceLevel: 'PRIMARY' },
        },
        makeClaims(),
        'SESSION_ASSURANCE_MISMATCH',
      ],
    ];

    for (const [snapshot, claims, code] of cases) {
      expectFailure(await resolve(snapshot, claims), code);
    }

    const epochSnapshot = makeSnapshot();
    expectFailure(
      await resolve({
        ...epochSnapshot,
        user: epochSnapshot.user === null ? null : { ...epochSnapshot.user, sessionEpoch: 8 },
      }),
      'SESSION_EPOCH_MISMATCH',
    );
  });

  it('requires an active authoritative family with the exact session binding', async () => {
    expectFailure(
      await resolve({ ...makeSnapshot(), sessionFamily: null }),
      'SESSION_FAMILY_MISMATCH',
    );

    const family = familyFrom(makeSnapshot());
    const bindingCases: ReadonlyArray<
      readonly [Partial<SessionFamilyIdentityRecord>, PrincipalResolutionFailureCode]
    > = [
      [{ id: 'different-family' }, 'SESSION_FAMILY_MISMATCH'],
      [{ userId: 'different-user' }, 'SESSION_FAMILY_MISMATCH'],
      [{ sessionEpoch: 8 }, 'SESSION_EPOCH_MISMATCH'],
      [{ actorType: 'staff' }, 'SESSION_ACTOR_MISMATCH'],
      [{ scope: OTHER_SELLER_SCOPE }, 'SESSION_SCOPE_MISMATCH'],
    ];

    for (const [change, code] of bindingCases) {
      expectFailure(
        await resolve({ ...makeSnapshot(), sessionFamily: { ...family, ...change } }),
        code,
      );
    }

    expectFailure(
      await resolve({
        ...makeSnapshot(),
        sessionFamily: {
          ...family,
          createdAt: new Date('2026-10-04T16:01:00.000Z'),
          expiresAt: new Date('2026-10-04T18:00:00.000Z'),
        },
      }),
      'SESSION_NOT_ACTIVE',
    );
    expectFailure(
      await resolve({
        ...makeSnapshot(),
        sessionFamily: { ...family, expiresAt: new Date(NOW) },
      }),
      'SESSION_EXPIRED',
    );
    expectFailure(
      await resolve({
        ...makeSnapshot(),
        sessionFamily: {
          ...family,
          revokedAt: new Date('2026-10-04T15:55:00.000Z'),
        },
      }),
      'SESSION_REVOKED',
    );
    expectFailure(
      await resolve({
        ...makeSnapshot(),
        sessionFamily: {
          ...family,
          revokedAt: new Date('2026-10-04T15:55:00.000Z'),
          reuseDetectedAt: new Date('2026-10-04T15:55:00.000Z'),
        },
      }),
      'SESSION_COMPROMISED',
    );
  });

  it('requires a live, unrotated, unrevoked, uncompromised session', async () => {
    const session = sessionFrom(makeSnapshot());
    const cases: ReadonlyArray<
      readonly [IdentityAuthorizationSnapshot, PrincipalResolutionFailureCode]
    > = [
      [
        {
          ...makeSnapshot(),
          session: {
            ...session,
            issuedAt: new Date('2026-10-04T16:01:00.000Z'),
            expiresAt: new Date('2026-10-04T17:00:00.000Z'),
          },
        },
        'SESSION_NOT_ACTIVE',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...session, expiresAt: new Date(NOW) },
        },
        'SESSION_EXPIRED',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...session, rotatedAt: new Date('2026-10-04T15:55:00.000Z') },
        },
        'SESSION_ROTATED',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...session, revokedAt: new Date('2026-10-04T15:55:00.000Z') },
        },
        'SESSION_REVOKED',
      ],
      [
        {
          ...makeSnapshot(),
          session: { ...session, reuseDetectedAt: new Date('2026-10-04T15:55:00.000Z') },
        },
        'SESSION_COMPROMISED',
      ],
    ];

    for (const [snapshot, code] of cases) {
      expectFailure(await resolve(snapshot), code);
    }
  });

  it('does not allow an access token to predate or outlive its session', async () => {
    const predatesSession = await resolve(makeSnapshot(), {
      ...makeClaims(),
      issuedAt: new Date('2026-10-04T14:59:00.000Z'),
    });
    expectFailure(predatesSession, 'ACCESS_TOKEN_SESSION_TIME_MISMATCH');

    const outlivesSession = await resolve(makeSnapshot(), {
      ...makeClaims(),
      expiresAt: new Date('2026-10-04T17:01:00.000Z'),
    });
    expectFailure(outlivesSession, 'ACCESS_TOKEN_SESSION_TIME_MISMATCH');
  });

  it('requires MFA for seller and staff principals but does not invent it for other actors', async () => {
    for (const actorType of ['seller_user', 'staff'] as const) {
      const scope = actorType === 'seller_user' ? SELLER_SCOPE : GLOBAL_SCOPE;
      const claims: VerifiedAccessClaims = {
        ...makeClaims(),
        actorType,
        scope,
        assuranceLevel: 'PRIMARY',
      };
      const snapshot = makeSnapshot();
      expectFailure(
        await resolve(
          {
            ...snapshot,
            session: {
              ...sessionFrom(snapshot),
              actorType,
              scope,
              assuranceLevel: 'PRIMARY',
              mfaCompletedAt: null,
            },
            sessionFamily: {
              ...familyFrom(snapshot),
              actorType,
              scope,
            },
          },
          claims,
        ),
        'MFA_REQUIRED',
      );
    }

    for (const actorType of ['customer', 'courier'] as const) {
      const scope =
        actorType === 'customer'
          ? GLOBAL_SCOPE
          : ({
              type: 'COURIER' as const,
              id: '66666666-6666-4666-8666-666666666666',
            } as const);
      const claims: VerifiedAccessClaims = {
        ...makeClaims(),
        actorType,
        scope,
        assuranceLevel: 'PRIMARY',
      };
      const snapshot = makeSnapshot();
      const result = await resolve(
        {
          ...snapshot,
          session: {
            ...sessionFrom(snapshot),
            actorType,
            scope,
            assuranceLevel: 'PRIMARY',
            mfaCompletedAt: null,
          },
          sessionFamily: {
            ...familyFrom(snapshot),
            actorType,
            scope,
          },
          assignments: snapshot.assignments.map((assignment) => ({
            ...assignment,
            actorType,
            scope,
          })),
          roles: snapshot.roles.map((role) => ({
            ...role,
            actorType,
            assignmentScopeType: scope.type,
          })),
        },
        claims,
      );
      assert.equal(result.ok, true);
    }
  });

  it('requires valid MFA evidence established before token issuance', async () => {
    for (const mfaCompletedAt of [
      null,
      new Date('2026-10-04T15:51:00.000Z'),
      new Date(Number.NaN),
    ]) {
      const snapshot = makeSnapshot();
      expectFailure(
        await resolve({
          ...snapshot,
          session: { ...sessionFrom(snapshot), mfaCompletedAt },
        }),
        'SESSION_ASSURANCE_INVALID',
      );
    }

    const rotatedGeneration = makeSnapshot();
    assert.equal(
      (
        await resolve({
          ...rotatedGeneration,
          session: {
            ...sessionFrom(rotatedGeneration),
            issuedAt: new Date('2026-10-04T15:30:00.000Z'),
            mfaCompletedAt: new Date('2026-10-04T15:00:00.000Z'),
          },
        })
      ).ok,
      true,
    );
  });

  it('requires a live role assignment for the exact session scope', async () => {
    const base = makeSnapshot();
    const unavailableAssignments: ReadonlyArray<IdentityAuthorizationSnapshot> = [
      { ...base, assignments: [] },
      {
        ...base,
        assignments: base.assignments.map((assignment) => ({
          ...assignment,
          scope: OTHER_SELLER_SCOPE,
        })),
      },
      {
        ...base,
        assignments: base.assignments.map((assignment) => ({
          ...assignment,
          validFrom: new Date('2026-10-05T16:00:00.000Z'),
        })),
      },
      {
        ...base,
        assignments: base.assignments.map((assignment) => ({
          ...assignment,
          validUntil: new Date(NOW),
        })),
      },
      {
        ...base,
        assignments: base.assignments.map((assignment) => ({
          ...assignment,
          revokedAt: new Date('2026-10-04T15:00:00.000Z'),
        })),
      },
      {
        ...base,
        roles: base.roles.map((role) => ({ ...role, status: 'DEPRECATED' })),
      },
    ];

    for (const snapshot of unavailableAssignments) {
      expectFailure(await resolve(snapshot), 'AUTHORIZATION_CONTEXT_MISSING');
    }
  });

  it('never projects a role assigned to a different actor audience', async () => {
    const base = makeSnapshot();
    const result = await resolve({
      ...base,
      assignments: base.assignments.map((assignment) => ({
        ...assignment,
        actorType: 'staff',
      })),
      roles: base.roles.map((role) => ({
        ...role,
        actorType: 'staff',
      })),
    });

    expectFailure(result, 'AUTHORIZATION_CONTEXT_MISSING');
  });

  it('fails closed on inconsistent authorization graph data', async () => {
    const base = makeSnapshot();
    const inconsistentSnapshots: ReadonlyArray<IdentityAuthorizationSnapshot> = [
      {
        ...base,
        assignments: base.assignments.map((assignment) => ({
          ...assignment,
          userId: 'different-user',
        })),
      },
      { ...base, roles: [] },
      {
        ...base,
        roles: base.roles.map((role) => ({ ...role, assignmentScopeType: 'WAREHOUSE' })),
      },
      {
        ...base,
        roles: base.roles.map((role) => ({ ...role, actorType: 'staff' })),
      },
      {
        ...base,
        rolePermissionGrants: base.rolePermissionGrants.map((grant) => ({
          ...grant,
          permissionId: 'missing-permission',
        })),
      },
      { ...base, roles: [...base.roles, firstFrom(base.roles)] },
      { ...base, permissions: [...base.permissions, firstFrom(base.permissions)] },
    ];

    for (const snapshot of inconsistentSnapshots) {
      expectFailure(await resolve(snapshot), 'AUTHORIZATION_DATA_INVALID');
    }
  });
});
