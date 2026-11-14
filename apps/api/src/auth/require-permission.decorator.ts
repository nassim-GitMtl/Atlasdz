import type { AssuranceLevel, AuthorizationScope } from '@atlas/identity';
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_REQUIREMENT_METADATA = Symbol('atlas.api.permission-requirement');

export const PRINCIPAL_AUTHORIZATION_SCOPE = 'PRINCIPAL' as const;

export interface RequiredPermissionOptions {
  readonly scope?: AuthorizationScope | typeof PRINCIPAL_AUTHORIZATION_SCOPE;
  readonly minimumAssurance?: AssuranceLevel;
}

export interface PermissionRequirementMetadata {
  readonly permission: string;
  readonly scope: AuthorizationScope | typeof PRINCIPAL_AUTHORIZATION_SCOPE;
  readonly minimumAssurance: AssuranceLevel;
}

const copyScope = (
  scope: AuthorizationScope | typeof PRINCIPAL_AUTHORIZATION_SCOPE,
): AuthorizationScope | typeof PRINCIPAL_AUTHORIZATION_SCOPE => {
  if (scope === PRINCIPAL_AUTHORIZATION_SCOPE || scope.type === 'GLOBAL') {
    return scope === PRINCIPAL_AUTHORIZATION_SCOPE
      ? PRINCIPAL_AUTHORIZATION_SCOPE
      : Object.freeze({ type: 'GLOBAL' as const });
  }

  return Object.freeze({ type: scope.type, id: scope.id });
};

export const RequirePermission = (
  permission: string,
  options: RequiredPermissionOptions = {},
): ReturnType<typeof SetMetadata> => {
  if (permission.length === 0 || permission.trim() !== permission) {
    throw new TypeError('Permission codes must be non-empty and must not contain outer whitespace');
  }

  const requirement = Object.freeze({
    permission,
    scope: copyScope(options.scope ?? PRINCIPAL_AUTHORIZATION_SCOPE),
    minimumAssurance: options.minimumAssurance ?? 'PRIMARY',
  }) satisfies PermissionRequirementMetadata;

  return SetMetadata(PERMISSION_REQUIREMENT_METADATA, requirement);
};
