export type ActorType = 'customer' | 'seller_user' | 'staff' | 'courier';

export type AssuranceLevel = 'PRIMARY' | 'MFA';

export type ScopeType = 'GLOBAL' | 'SELLER' | 'WAREHOUSE' | 'COURIER';

export type AuthorizationScope =
  Readonly<{ type: 'GLOBAL' }> | Readonly<{ type: Exclude<ScopeType, 'GLOBAL'>; id: string }>;

export type UserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'DISABLED';

export interface VerifiedAccessClaims {
  readonly tokenId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionFamilyId: string;
  readonly sessionEpoch: number;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface UserIdentityRecord {
  readonly id: string;
  readonly status: UserStatus;
  readonly sessionEpoch: number;
}

export interface SessionIdentityRecord {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly sessionEpoch: number;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly mfaCompletedAt: Date | null;
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly reuseDetectedAt: Date | null;
}

export interface SessionFamilyIdentityRecord {
  readonly id: string;
  readonly userId: string;
  readonly sessionEpoch: number;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly reuseDetectedAt: Date | null;
}

export interface RoleRecord {
  readonly id: string;
  readonly code: string;
  readonly actorType: ActorType;
  readonly assignmentScopeType: ScopeType;
  readonly status: 'ACTIVE' | 'DEPRECATED';
}

export interface PermissionRecord {
  readonly id: string;
  readonly code: string;
  readonly status: 'ACTIVE' | 'DEPRECATED';
}

export interface UserRoleAssignmentRecord {
  readonly id: string;
  readonly userId: string;
  readonly roleId: string;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly revokedAt: Date | null;
}

export interface RolePermissionGrantRecord {
  readonly id: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly grantedAt: Date;
  readonly validUntil: Date | null;
  readonly revokedAt: Date | null;
}

export interface IdentityAuthorizationSnapshot {
  readonly user: UserIdentityRecord | null;
  readonly session: SessionIdentityRecord | null;
  readonly sessionFamily: SessionFamilyIdentityRecord | null;
  readonly assignments: readonly UserRoleAssignmentRecord[];
  readonly roles: readonly RoleRecord[];
  readonly rolePermissionGrants: readonly RolePermissionGrantRecord[];
  readonly permissions: readonly PermissionRecord[];
}

export interface EffectivePermissionGrant {
  readonly permission: string;
  readonly scope: AuthorizationScope;
}

export interface Principal {
  readonly tokenId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionFamilyId: string;
  readonly sessionEpoch: number;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
  readonly mfaCompletedAt: Date | null;
  readonly roleCodes: readonly string[];
  readonly permissionGrants: readonly EffectivePermissionGrant[];
}

export interface CorrelationContext {
  readonly correlationId: string;
}

export interface SessionSelfServiceContext {
  readonly principal: Principal;
  readonly correlation: CorrelationContext;
}

export interface SessionFamilyRecord {
  readonly familyId: string;
  readonly deviceLabel: string | null;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
  readonly createdAt: Date;
  readonly lastSeenAt: Date | null;
  readonly expiresAt: Date;
}

export interface SessionFamilySummary extends SessionFamilyRecord {
  readonly isCurrent: boolean;
}

export interface SessionFamilyList {
  readonly families: readonly SessionFamilySummary[];
}

export interface SessionOperationActor {
  readonly type: ActorType;
  readonly id: string;
  readonly sessionId: string;
  readonly effectiveRoleCodes: readonly string[];
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
}

export interface SessionPersistenceContext {
  readonly ownerUserId: string;
  readonly actor: SessionOperationActor;
  readonly currentFamilyId: string;
  readonly correlationId: string;
}

export interface SessionRevocationCounts {
  readonly revokedFamilyCount: number;
  readonly revokedSessionCount: number;
}

export type RevokeOwnedSessionFamilyPersistenceResult =
  Readonly<{ found: false }> | Readonly<{ found: true; counts: SessionRevocationCounts }>;

export type RevokeSessionFamilyResult =
  | Readonly<{ ok: false; code: 'SESSION_NOT_FOUND' }>
  | Readonly<{ ok: true; counts: SessionRevocationCounts }>;

export type RevokeOtherSessionFamiliesResult = Readonly<{
  ok: true;
  counts: SessionRevocationCounts;
}>;

/**
 * Persistence-safe refresh input. Digests are fixed-width derived verifiers;
 * raw bearer credentials must never cross this boundary.
 */
export interface RefreshSessionRotationCommand {
  readonly presentedTokenDigest: Uint8Array;
  readonly successorSessionId: string;
  readonly successorTokenDigest: Uint8Array;
  readonly correlationId: string;
}

export interface RotatedSessionBinding {
  readonly sessionId: string;
  readonly familyId: string;
  readonly userId: string;
  readonly sessionEpoch: number;
  readonly actorType: ActorType;
  readonly scope: AuthorizationScope;
  readonly assuranceLevel: AssuranceLevel;
  readonly mfaCompletedAt: Date | null;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export type RefreshSessionRotationResult =
  | Readonly<{ kind: 'ROTATED'; binding: RotatedSessionBinding }>
  | Readonly<{ kind: 'REFRESH_TOKEN_REUSED'; evidenceRecorded: boolean }>
  | Readonly<{ kind: 'REFRESH_TOKEN_INVALID' }>
  | Readonly<{ kind: 'SESSION_REVOKED' }>;

export type PrincipalResolutionFailureCode =
  | 'ACCESS_TOKEN_TIME_INVALID'
  | 'ACCESS_TOKEN_NOT_ACTIVE'
  | 'ACCESS_TOKEN_EXPIRED'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_OWNERSHIP_MISMATCH'
  | 'SESSION_FAMILY_MISMATCH'
  | 'SESSION_EPOCH_MISMATCH'
  | 'SESSION_ACTOR_MISMATCH'
  | 'SESSION_SCOPE_MISMATCH'
  | 'SESSION_ASSURANCE_MISMATCH'
  | 'SESSION_NOT_ACTIVE'
  | 'SESSION_EXPIRED'
  | 'SESSION_ROTATED'
  | 'SESSION_REVOKED'
  | 'SESSION_COMPROMISED'
  | 'ACCESS_TOKEN_SESSION_TIME_MISMATCH'
  | 'MFA_REQUIRED'
  | 'SESSION_ASSURANCE_INVALID'
  | 'AUTHORIZATION_CONTEXT_MISSING'
  | 'AUTHORIZATION_DATA_INVALID';

export type PrincipalResolutionResult =
  | Readonly<{ ok: true; principal: Principal }>
  | Readonly<{ ok: false; code: PrincipalResolutionFailureCode }>;

export type CredentialVerificationFailure = Readonly<{
  ok: false;
  code: 'CREDENTIAL_REJECTED';
}>;

export type CredentialVerificationResult =
  Readonly<{ ok: true; claims: VerifiedAccessClaims }> | CredentialVerificationFailure;

export type AuthenticatePrincipalResult = PrincipalResolutionResult | CredentialVerificationFailure;

export interface AuthorizationRequirement {
  readonly permission: string;
  readonly scope: AuthorizationScope;
  readonly minimumAssurance: AssuranceLevel;
}

export type AuthorizationDenialCode =
  'PERMISSION_MISSING' | 'SCOPE_MISMATCH' | 'ASSURANCE_INSUFFICIENT';

export type AuthorizationDecision =
  Readonly<{ allowed: true }> | Readonly<{ allowed: false; code: AuthorizationDenialCode }>;
