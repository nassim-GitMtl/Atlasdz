import { SafeApplicationError } from '@atlas/contracts';
import type { Principal } from '@atlas/identity';
import type { Request } from 'express';

export interface PrincipalAwareRequest extends Request {
  readonly principal?: Principal;
}

export interface AuthenticatedRequest extends Request {
  readonly principal: Principal;
}

export function attachRequestPrincipal(
  request: PrincipalAwareRequest,
  principal: Principal,
): asserts request is AuthenticatedRequest {
  Object.defineProperty(request, 'principal', {
    configurable: false,
    enumerable: false,
    value: principal,
    writable: false,
  });
}

export const hasRequestPrincipal = (
  request: PrincipalAwareRequest,
): request is AuthenticatedRequest => request.principal !== undefined;

export const getRequestPrincipal = (request: PrincipalAwareRequest): Principal => {
  if (!hasRequestPrincipal(request)) {
    throw new SafeApplicationError('AUTHENTICATION_REQUIRED');
  }

  return request.principal;
};
