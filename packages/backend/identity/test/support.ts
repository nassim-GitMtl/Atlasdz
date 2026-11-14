import type {
  ClockPort,
  IdentityAuthorizationRepositoryPort,
  IdentityAuthorizationSnapshot,
  Principal,
  VerifiedAccessClaims,
} from '../src/index.js';

export const NOW = new Date('2026-10-04T16:00:00.000Z');
export const SELLER_SCOPE = Object.freeze({
  type: 'SELLER' as const,
  id: '22222222-2222-4222-8222-222222222222',
});
export const OTHER_SELLER_SCOPE = Object.freeze({
  type: 'SELLER' as const,
  id: '33333333-3333-4333-8333-333333333333',
});
export const GLOBAL_SCOPE = Object.freeze({ type: 'GLOBAL' as const });

export const makeClaims = (): VerifiedAccessClaims => ({
  tokenId: 'token-1',
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '44444444-4444-4444-8444-444444444444',
  sessionFamilyId: '55555555-5555-4555-8555-555555555555',
  sessionEpoch: 7,
  actorType: 'seller_user',
  scope: SELLER_SCOPE,
  assuranceLevel: 'MFA',
  issuedAt: new Date('2026-10-04T15:50:00.000Z'),
  expiresAt: new Date('2026-10-04T16:10:00.000Z'),
});

export const makeSnapshot = (): IdentityAuthorizationSnapshot => ({
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    sessionEpoch: 7,
  },
  session: {
    id: '44444444-4444-4444-8444-444444444444',
    userId: '11111111-1111-4111-8111-111111111111',
    familyId: '55555555-5555-4555-8555-555555555555',
    sessionEpoch: 7,
    actorType: 'seller_user',
    scope: SELLER_SCOPE,
    assuranceLevel: 'MFA',
    issuedAt: new Date('2026-10-04T15:00:00.000Z'),
    expiresAt: new Date('2026-10-04T17:00:00.000Z'),
    mfaCompletedAt: new Date('2026-10-04T15:45:00.000Z'),
    rotatedAt: null,
    revokedAt: null,
    reuseDetectedAt: null,
  },
  sessionFamily: {
    id: '55555555-5555-4555-8555-555555555555',
    userId: '11111111-1111-4111-8111-111111111111',
    sessionEpoch: 7,
    actorType: 'seller_user',
    scope: SELLER_SCOPE,
    createdAt: new Date('2026-10-04T14:50:00.000Z'),
    expiresAt: new Date('2026-10-04T18:00:00.000Z'),
    revokedAt: null,
    reuseDetectedAt: null,
  },
  assignments: [
    {
      id: 'assignment-1',
      userId: '11111111-1111-4111-8111-111111111111',
      roleId: 'role-1',
      actorType: 'seller_user',
      scope: SELLER_SCOPE,
      validFrom: new Date('2026-10-03T16:00:00.000Z'),
      validUntil: null,
      revokedAt: null,
    },
  ],
  roles: [
    {
      id: 'role-1',
      code: 'SELLER_OPERATOR',
      actorType: 'seller_user',
      assignmentScopeType: 'SELLER',
      status: 'ACTIVE',
    },
  ],
  rolePermissionGrants: [
    {
      id: 'role-permission-1',
      roleId: 'role-1',
      permissionId: 'permission-1',
      grantedAt: new Date('2026-10-03T16:00:00.000Z'),
      validUntil: null,
      revokedAt: null,
    },
  ],
  permissions: [
    {
      id: 'permission-1',
      code: 'orders.read',
      status: 'ACTIVE',
    },
  ],
});

export class FixedClock implements ClockPort {
  public constructor(private readonly value: Date = NOW) {}

  public now(): Date {
    return new Date(this.value.getTime());
  }
}

export class InMemoryAuthorizationRepository implements IdentityAuthorizationRepositoryPort {
  public readonly calls: Array<Readonly<{ userId: string; sessionId: string }>> = [];

  public constructor(public snapshot: IdentityAuthorizationSnapshot) {}

  public async loadAuthorizationSnapshot(
    userId: string,
    sessionId: string,
  ): Promise<IdentityAuthorizationSnapshot> {
    this.calls.push({ userId, sessionId });
    return this.snapshot;
  }
}

export const makePrincipal = (): Principal => ({
  tokenId: 'token-1',
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '44444444-4444-4444-8444-444444444444',
  sessionFamilyId: '55555555-5555-4555-8555-555555555555',
  sessionEpoch: 7,
  actorType: 'seller_user',
  scope: SELLER_SCOPE,
  assuranceLevel: 'MFA',
  mfaCompletedAt: new Date('2026-10-04T15:45:00.000Z'),
  roleCodes: ['SELLER_OPERATOR'],
  permissionGrants: [{ permission: 'orders.read', scope: SELLER_SCOPE }],
});
