import type {
  AuthorizationScope,
  EffectivePermissionGrant,
  Principal,
  PrincipalResolutionFailureCode,
  PrincipalResolutionResult,
  RoleRecord,
  SessionIdentityRecord,
  VerifiedAccessClaims,
} from './domain.js';
import type { ClockPort, IdentityAuthorizationRepositoryPort } from './ports.js';

const failure = (code: PrincipalResolutionFailureCode): PrincipalResolutionResult => ({
  ok: false,
  code,
});

const time = (value: Date): number => value.getTime();

const isValidDate = (value: Date): boolean => Number.isFinite(time(value));

export const scopesEqual = (left: AuthorizationScope, right: AuthorizationScope): boolean => {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === 'GLOBAL' && right.type === 'GLOBAL') {
    return true;
  }

  return left.type !== 'GLOBAL' && right.type !== 'GLOBAL' && left.id === right.id;
};

const freezeScope = (scope: AuthorizationScope): AuthorizationScope =>
  scope.type === 'GLOBAL'
    ? Object.freeze({ type: 'GLOBAL' as const })
    : Object.freeze({ type: scope.type, id: scope.id });

const buildUniqueMap = <T extends Readonly<{ id: string }>>(
  values: readonly T[],
): ReadonlyMap<string, T> | null => {
  const result = new Map<string, T>();

  for (const value of values) {
    if (result.has(value.id)) {
      return null;
    }
    result.set(value.id, value);
  }

  return result;
};

const isValidRange = (start: Date, end: Date | null): boolean =>
  isValidDate(start) && (end === null || (isValidDate(end) && time(end) > time(start)));

const isLive = (start: Date, end: Date | null, revokedAt: Date | null, now: number): boolean =>
  revokedAt === null && time(start) <= now && (end === null || now < time(end));

const scopeKey = (scope: AuthorizationScope): string =>
  scope.type === 'GLOBAL' ? scope.type : `${scope.type}:${scope.id}`;

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort());

const immutableGrant = (grant: EffectivePermissionGrant): EffectivePermissionGrant =>
  Object.freeze({ permission: grant.permission, scope: freezeScope(grant.scope) });

const buildPrincipal = (
  claims: VerifiedAccessClaims,
  session: SessionIdentityRecord,
  activeRoles: readonly RoleRecord[],
  permissionGrants: readonly EffectivePermissionGrant[],
): Principal => {
  return Object.freeze({
    tokenId: claims.tokenId,
    userId: claims.userId,
    sessionId: claims.sessionId,
    sessionFamilyId: claims.sessionFamilyId,
    sessionEpoch: claims.sessionEpoch,
    actorType: claims.actorType,
    scope: freezeScope(claims.scope),
    assuranceLevel: claims.assuranceLevel,
    mfaCompletedAt: session.mfaCompletedAt === null ? null : new Date(time(session.mfaCompletedAt)),
    roleCodes: uniqueSorted(activeRoles.map((role) => role.code)),
    permissionGrants: Object.freeze(permissionGrants.map(immutableGrant)),
  });
};

export class PrincipalResolver {
  public constructor(
    private readonly repository: IdentityAuthorizationRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async resolve(claims: VerifiedAccessClaims): Promise<PrincipalResolutionResult> {
    const now = time(this.clock.now());
    const claimIssuedAt = time(claims.issuedAt);
    const claimExpiresAt = time(claims.expiresAt);

    if (
      !Number.isFinite(now) ||
      !isValidDate(claims.issuedAt) ||
      !isValidDate(claims.expiresAt) ||
      claimExpiresAt <= claimIssuedAt
    ) {
      return failure('ACCESS_TOKEN_TIME_INVALID');
    }
    if (now < claimIssuedAt) {
      return failure('ACCESS_TOKEN_NOT_ACTIVE');
    }
    if (now >= claimExpiresAt) {
      return failure('ACCESS_TOKEN_EXPIRED');
    }

    const snapshot = await this.repository.loadAuthorizationSnapshot(
      claims.userId,
      claims.sessionId,
    );
    const { user, session, sessionFamily } = snapshot;

    if (user === null) {
      return failure('USER_NOT_FOUND');
    }
    if (user.id !== claims.userId) {
      return failure('AUTHORIZATION_DATA_INVALID');
    }
    if (user.status !== 'ACTIVE') {
      return failure('USER_INACTIVE');
    }
    if (session === null) {
      return failure('SESSION_NOT_FOUND');
    }
    if (session.id !== claims.sessionId || session.userId !== claims.userId) {
      return failure('SESSION_OWNERSHIP_MISMATCH');
    }
    if (session.familyId !== claims.sessionFamilyId) {
      return failure('SESSION_FAMILY_MISMATCH');
    }
    if (sessionFamily === null) {
      return failure('SESSION_FAMILY_MISMATCH');
    }
    if (
      sessionFamily.id !== claims.sessionFamilyId ||
      sessionFamily.id !== session.familyId ||
      sessionFamily.userId !== claims.userId ||
      sessionFamily.userId !== session.userId
    ) {
      return failure('SESSION_FAMILY_MISMATCH');
    }
    if (user.sessionEpoch !== claims.sessionEpoch || session.sessionEpoch !== claims.sessionEpoch) {
      return failure('SESSION_EPOCH_MISMATCH');
    }
    if (sessionFamily.sessionEpoch !== claims.sessionEpoch) {
      return failure('SESSION_EPOCH_MISMATCH');
    }
    if (session.actorType !== claims.actorType) {
      return failure('SESSION_ACTOR_MISMATCH');
    }
    if (sessionFamily.actorType !== claims.actorType) {
      return failure('SESSION_ACTOR_MISMATCH');
    }
    if (!scopesEqual(session.scope, claims.scope)) {
      return failure('SESSION_SCOPE_MISMATCH');
    }
    if (!scopesEqual(sessionFamily.scope, claims.scope)) {
      return failure('SESSION_SCOPE_MISMATCH');
    }
    if (session.assuranceLevel !== claims.assuranceLevel) {
      return failure('SESSION_ASSURANCE_MISMATCH');
    }
    if (!isValidRange(session.issuedAt, session.expiresAt)) {
      return failure('AUTHORIZATION_DATA_INVALID');
    }
    if (!isValidRange(sessionFamily.createdAt, sessionFamily.expiresAt)) {
      return failure('AUTHORIZATION_DATA_INVALID');
    }
    if (now < time(sessionFamily.createdAt)) {
      return failure('SESSION_NOT_ACTIVE');
    }
    if (now >= time(sessionFamily.expiresAt)) {
      return failure('SESSION_EXPIRED');
    }
    if (sessionFamily.reuseDetectedAt !== null) {
      return failure('SESSION_COMPROMISED');
    }
    if (sessionFamily.revokedAt !== null) {
      return failure('SESSION_REVOKED');
    }
    if (now < time(session.issuedAt)) {
      return failure('SESSION_NOT_ACTIVE');
    }
    if (now >= time(session.expiresAt)) {
      return failure('SESSION_EXPIRED');
    }
    if (session.rotatedAt !== null) {
      return failure('SESSION_ROTATED');
    }
    if (session.reuseDetectedAt !== null) {
      return failure('SESSION_COMPROMISED');
    }
    if (session.revokedAt !== null) {
      return failure('SESSION_REVOKED');
    }
    if (
      time(session.issuedAt) < time(sessionFamily.createdAt) ||
      time(session.expiresAt) > time(sessionFamily.expiresAt)
    ) {
      return failure('AUTHORIZATION_DATA_INVALID');
    }
    if (claimIssuedAt < time(session.issuedAt) || claimExpiresAt > time(session.expiresAt)) {
      return failure('ACCESS_TOKEN_SESSION_TIME_MISMATCH');
    }

    if (claims.assuranceLevel === 'MFA') {
      if (
        session.mfaCompletedAt === null ||
        !isValidDate(session.mfaCompletedAt) ||
        time(session.mfaCompletedAt) > claimIssuedAt
      ) {
        return failure('SESSION_ASSURANCE_INVALID');
      }
    } else if (session.mfaCompletedAt !== null) {
      return failure('SESSION_ASSURANCE_INVALID');
    }

    if (
      (claims.actorType === 'staff' || claims.actorType === 'seller_user') &&
      claims.assuranceLevel !== 'MFA'
    ) {
      return failure('MFA_REQUIRED');
    }

    const rolesById = buildUniqueMap(snapshot.roles);
    const permissionsById = buildUniqueMap(snapshot.permissions);
    if (rolesById === null || permissionsById === null) {
      return failure('AUTHORIZATION_DATA_INVALID');
    }

    const activeRoles: RoleRecord[] = [];
    const activeRoleIds = new Set<string>();

    for (const assignment of snapshot.assignments) {
      if (assignment.userId !== claims.userId) {
        return failure('AUTHORIZATION_DATA_INVALID');
      }
      if (!isValidRange(assignment.validFrom, assignment.validUntil)) {
        return failure('AUTHORIZATION_DATA_INVALID');
      }
      if (!isLive(assignment.validFrom, assignment.validUntil, assignment.revokedAt, now)) {
        continue;
      }

      const role = rolesById.get(assignment.roleId);
      if (
        role === undefined ||
        role.assignmentScopeType !== assignment.scope.type ||
        role.actorType !== assignment.actorType
      ) {
        return failure('AUTHORIZATION_DATA_INVALID');
      }
      if (
        assignment.actorType !== claims.actorType ||
        !scopesEqual(assignment.scope, claims.scope)
      ) {
        continue;
      }
      if (role.status !== 'ACTIVE') {
        continue;
      }

      activeRoleIds.add(role.id);
      activeRoles.push(role);
    }

    if (activeRoleIds.size === 0) {
      return failure('AUTHORIZATION_CONTEXT_MISSING');
    }

    const grantsByKey = new Map<string, EffectivePermissionGrant>();
    for (const rolePermission of snapshot.rolePermissionGrants) {
      if (!activeRoleIds.has(rolePermission.roleId)) {
        continue;
      }
      if (!isValidRange(rolePermission.grantedAt, rolePermission.validUntil)) {
        return failure('AUTHORIZATION_DATA_INVALID');
      }
      if (
        !isLive(rolePermission.grantedAt, rolePermission.validUntil, rolePermission.revokedAt, now)
      ) {
        continue;
      }

      const permission = permissionsById.get(rolePermission.permissionId);
      if (permission === undefined) {
        return failure('AUTHORIZATION_DATA_INVALID');
      }
      if (permission.status !== 'ACTIVE') {
        continue;
      }

      const grant = { permission: permission.code, scope: claims.scope };
      grantsByKey.set(`${permission.code}|${scopeKey(claims.scope)}`, grant);
    }

    return {
      ok: true,
      principal: buildPrincipal(claims, session, activeRoles, [...grantsByKey.values()]),
    };
  }
}
