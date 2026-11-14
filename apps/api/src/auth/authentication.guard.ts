import { SafeApplicationError } from '@atlas/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PUBLIC_ROUTE_METADATA } from './public.decorator.js';
import { attachRequestPrincipal, type PrincipalAwareRequest } from './request-principal.js';
import { PRINCIPAL_AUTHENTICATOR, type PrincipalAuthenticator } from './tokens.js';

const bearerCredentialPattern = /^Bearer ([A-Za-z0-9\-._~+/]+={0,})$/i;

const countAuthorizationHeaders = (rawHeaders: readonly string[]): number => {
  let count = 0;

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'authorization') {
      count += 1;
    }
  }

  return count;
};

export const parseBearerCredential = (request: PrincipalAwareRequest): string | null => {
  if (countAuthorizationHeaders(request.rawHeaders) !== 1) {
    return null;
  }

  const authorization: unknown = request.headers.authorization;
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = bearerCredentialPattern.exec(authorization);
  return match?.[1] ?? null;
};

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(
    @Inject(PRINCIPAL_AUTHENTICATOR)
    private readonly authenticator: PrincipalAuthenticator,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PrincipalAwareRequest>();
    const credential = parseBearerCredential(request);
    if (credential === null) {
      throw new SafeApplicationError('AUTHENTICATION_REQUIRED');
    }

    const result = await this.authenticator.execute(credential);
    if (!result.ok) {
      throw new SafeApplicationError(
        result.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'AUTHENTICATION_REQUIRED',
      );
    }

    attachRequestPrincipal(request, result.principal);
    return true;
  }
}
