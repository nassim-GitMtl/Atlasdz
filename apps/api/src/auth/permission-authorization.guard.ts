import { SafeApplicationError } from '@atlas/contracts';
import type { AuthorizationRequirement } from '@atlas/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AUTHENTICATED_ONLY_ROUTE_METADATA } from './authenticated-only.decorator.js';
import { PUBLIC_ROUTE_METADATA } from './public.decorator.js';
import {
  PERMISSION_REQUIREMENT_METADATA,
  PRINCIPAL_AUTHORIZATION_SCOPE,
  type PermissionRequirementMetadata,
} from './require-permission.decorator.js';
import { getRequestPrincipal, type PrincipalAwareRequest } from './request-principal.js';
import { PRINCIPAL_PERMISSION_AUTHORIZER, type PrincipalPermissionAuthorizer } from './tokens.js';

@Injectable()
export class PermissionAuthorizationGuard implements CanActivate {
  public constructor(
    @Inject(PRINCIPAL_PERMISSION_AUTHORIZER)
    private readonly authorizer: PrincipalPermissionAuthorizer,
    private readonly reflector: Reflector,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const metadataTargets = [context.getHandler(), context.getClass()];
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, metadataTargets) === true;
    const isAuthenticatedOnly =
      this.reflector.getAllAndOverride<boolean>(
        AUTHENTICATED_ONLY_ROUTE_METADATA,
        metadataTargets,
      ) === true;
    const metadata = this.reflector.getAllAndOverride<PermissionRequirementMetadata>(
      PERMISSION_REQUIREMENT_METADATA,
      metadataTargets,
    );
    const classificationCount =
      Number(isPublic) + Number(isAuthenticatedOnly) + Number(metadata !== undefined);

    if (classificationCount !== 1) {
      throw new SafeApplicationError('FORBIDDEN');
    }

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PrincipalAwareRequest>();
    const principal = getRequestPrincipal(request);

    if (isAuthenticatedOnly) {
      return true;
    }

    if (metadata === undefined) {
      throw new SafeApplicationError('FORBIDDEN');
    }

    const requirement: AuthorizationRequirement = {
      permission: metadata.permission,
      scope: metadata.scope === PRINCIPAL_AUTHORIZATION_SCOPE ? principal.scope : metadata.scope,
      minimumAssurance: metadata.minimumAssurance,
    };
    const decision = this.authorizer.authorize(principal, requirement);

    if (decision.allowed) {
      return true;
    }

    throw new SafeApplicationError(
      decision.code === 'ASSURANCE_INSUFFICIENT' ? 'STEP_UP_AUTH_REQUIRED' : 'FORBIDDEN',
    );
  }
}
