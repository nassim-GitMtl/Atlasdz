import type {
  AuthenticatePrincipalResult,
  AuthorizationDecision,
  AuthorizationRequirement,
  Principal,
} from '@atlas/identity';

export interface PrincipalAuthenticator {
  execute(rawCredential: string): Promise<AuthenticatePrincipalResult>;
}

export interface PrincipalPermissionAuthorizer {
  authorize(principal: Principal, requirement: AuthorizationRequirement): AuthorizationDecision;
}

export const PRINCIPAL_AUTHENTICATOR = Symbol('atlas.api.principal-authenticator');

export const PRINCIPAL_PERMISSION_AUTHORIZER = Symbol('atlas.api.principal-permission-authorizer');
