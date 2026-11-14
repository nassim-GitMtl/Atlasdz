import type {
  AssuranceLevel,
  AuthorizationDecision,
  AuthorizationRequirement,
  AuthorizationScope,
  Principal,
} from './domain.js';

const assuranceRank: Readonly<Record<AssuranceLevel, number>> = {
  PRIMARY: 1,
  MFA: 2,
};

const scopeAllows = (granted: AuthorizationScope, required: AuthorizationScope): boolean => {
  if (granted.type === 'GLOBAL') {
    return true;
  }

  return required.type !== 'GLOBAL' && granted.type === required.type && granted.id === required.id;
};

export class PermissionAuthorizer {
  public authorize(
    principal: Principal,
    requirement: AuthorizationRequirement,
  ): AuthorizationDecision {
    const permissionGrants = principal.permissionGrants.filter(
      (grant) => grant.permission === requirement.permission,
    );
    if (permissionGrants.length === 0) {
      return { allowed: false, code: 'PERMISSION_MISSING' };
    }
    if (!permissionGrants.some((grant) => scopeAllows(grant.scope, requirement.scope))) {
      return { allowed: false, code: 'SCOPE_MISMATCH' };
    }
    if (
      assuranceRank[principal.assuranceLevel] < assuranceRank[requirement.minimumAssurance] ||
      (requirement.minimumAssurance === 'MFA' && principal.mfaCompletedAt === null)
    ) {
      return { allowed: false, code: 'ASSURANCE_INSUFFICIENT' };
    }

    return { allowed: true };
  }
}
