import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SafeApplicationError } from '@atlas/contracts';
import {
  PermissionAuthorizer,
  type AuthenticatePrincipalResult,
  type Principal,
} from '@atlas/identity';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AUTHENTICATED_ONLY_ROUTE_METADATA,
  AuthenticationGuard,
  AuthenticatedOnly,
  PERMISSION_REQUIREMENT_METADATA,
  PermissionAuthorizationGuard,
  Public,
  RequirePermission,
  type PermissionRequirementMetadata,
  type PrincipalAuthenticator,
  type PrincipalAwareRequest,
} from '../src/auth/index.js';

class TestController {
  public route(): void {}
}

class DecoratedController {
  @Public()
  public publicRoute(): void {}

  @AuthenticatedOnly()
  public authenticatedRoute(): void {}

  @RequirePermission('orders.read')
  public protectedRoute(): void {}

  @Public()
  @AuthenticatedOnly()
  public ambiguousRoute(): void {}
}

const principal: Principal = Object.freeze({
  tokenId: 'token-1',
  userId: 'user-1',
  sessionId: 'session-1',
  sessionFamilyId: 'family-1',
  sessionEpoch: 3,
  actorType: 'customer',
  scope: Object.freeze({ type: 'SELLER', id: 'seller-1' }),
  assuranceLevel: 'PRIMARY',
  mfaCompletedAt: null,
  roleCodes: Object.freeze(['customer']),
  permissionGrants: Object.freeze([
    Object.freeze({
      permission: 'orders.read',
      scope: Object.freeze({ type: 'SELLER', id: 'seller-1' }),
    }),
  ]),
});

const makeRequest = (authorization?: unknown, rawHeaders?: readonly string[]) =>
  ({
    headers: authorization === undefined ? {} : { authorization },
    rawHeaders:
      rawHeaders ?? (typeof authorization === 'string' ? ['Authorization', authorization] : []),
  }) as unknown as PrincipalAwareRequest;

const makeContext = (
  request: PrincipalAwareRequest,
  handler: () => void = () => undefined,
): ExecutionContext =>
  ({
    getArgs: () => [request],
    getArgByIndex: (index: number) => (index === 0 ? request : undefined),
    getClass: () => TestController,
    getHandler: () => handler,
    getType: () => 'http',
    switchToHttp: () => ({
      getNext: () => undefined,
      getRequest: () => request,
      getResponse: () => undefined,
    }),
    switchToRpc: () => {
      throw new Error('not implemented');
    },
    switchToWs: () => {
      throw new Error('not implemented');
    },
  }) as unknown as ExecutionContext;

const assertSafeError =
  (code: SafeApplicationError['code']) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof SafeApplicationError);
    assert.equal(error.code, code);
    return true;
  };

const makeAuthenticationGuard = (
  result: AuthenticatePrincipalResult,
  credentials: string[],
): AuthenticationGuard => {
  const authenticator: PrincipalAuthenticator = {
    execute: async (credential) => {
      credentials.push(credential);
      return result;
    },
  };

  return new AuthenticationGuard(authenticator, new Reflector());
};

const makeAuthorizationContext = (
  request: PrincipalAwareRequest,
  metadata?: PermissionRequirementMetadata,
): ExecutionContext => {
  const handler = (): void => undefined;
  if (metadata !== undefined) {
    Reflect.defineMetadata(PERMISSION_REQUIREMENT_METADATA, metadata, handler);
  }

  return makeContext(request, handler);
};

describe('AuthenticationGuard', () => {
  it('rejects missing, malformed, empty, ambiguous, and duplicate Bearer credentials', async (t) => {
    const cases: ReadonlyArray<readonly [string, PrincipalAwareRequest]> = [
      ['missing', makeRequest()],
      ['wrong scheme', makeRequest('Basic abc')],
      ['empty', makeRequest('Bearer ')],
      ['outer whitespace', makeRequest(' Bearer abc')],
      ['embedded whitespace', makeRequest('Bearer abc def')],
      ['comma-separated credentials', makeRequest('Bearer abc,Bearer def')],
      [
        'duplicate headers',
        makeRequest('Bearer first', [
          'Authorization',
          'Bearer first',
          'authorization',
          'Bearer second',
        ]),
      ],
      [
        'array-valued header',
        makeRequest(['Bearer first', 'Bearer second'], ['Authorization', 'Bearer first']),
      ],
    ];

    for (const [name, request] of cases) {
      await t.test(name, async () => {
        const credentials: string[] = [];
        const guard = makeAuthenticationGuard({ ok: true, principal }, credentials);

        await assert.rejects(
          guard.canActivate(makeContext(request)),
          assertSafeError('AUTHENTICATION_REQUIRED'),
        );
        assert.deepEqual(credentials, []);
      });
    }
  });

  it('bypasses authentication only when the route is explicitly public', async () => {
    const credentials: string[] = [];
    const guard = makeAuthenticationGuard({ ok: true, principal }, credentials);
    const handler = DecoratedController.prototype.publicRoute;

    assert.equal(await guard.canActivate(makeContext(makeRequest(), handler)), true);
    assert.deepEqual(credentials, []);
  });

  it('accepts one case-insensitive Bearer scheme and attaches the resolved principal immutably', async () => {
    const credentials: string[] = [];
    const guard = makeAuthenticationGuard({ ok: true, principal }, credentials);
    const request = makeRequest('bEaReR opaque-token_1.2~x+/==');

    assert.equal(await guard.canActivate(makeContext(request)), true);
    assert.deepEqual(credentials, ['opaque-token_1.2~x+/==']);
    assert.equal(request.principal, principal);
    assert.deepEqual(Object.getOwnPropertyDescriptor(request, 'principal'), {
      configurable: false,
      enumerable: false,
      value: principal,
      writable: false,
    });
  });

  it('exposes only the explicit revoked-session failure', async () => {
    const guard = makeAuthenticationGuard({ ok: false, code: 'SESSION_REVOKED' }, []);

    await assert.rejects(
      guard.canActivate(makeContext(makeRequest('Bearer revoked'))),
      assertSafeError('SESSION_REVOKED'),
    );
  });

  it('collapses credential and other principal failures to authentication required', async (t) => {
    const failures: Extract<AuthenticatePrincipalResult, { readonly ok: false }>[] = [
      { ok: false, code: 'CREDENTIAL_REJECTED' },
      { ok: false, code: 'USER_NOT_FOUND' },
      { ok: false, code: 'SESSION_OWNERSHIP_MISMATCH' },
      { ok: false, code: 'MFA_REQUIRED' },
    ];

    for (const failure of failures) {
      await t.test(failure.code, async () => {
        const guard = makeAuthenticationGuard(failure, []);
        await assert.rejects(
          guard.canActivate(makeContext(makeRequest('Bearer rejected'))),
          assertSafeError('AUTHENTICATION_REQUIRED'),
        );
      });
    }
  });
});

describe('PermissionAuthorizationGuard', () => {
  const guard = new PermissionAuthorizationGuard(new PermissionAuthorizer(), new Reflector());

  it('denies unclassified routes', () => {
    assert.throws(
      () => guard.canActivate(makeAuthorizationContext(makeRequest())),
      assertSafeError('FORBIDDEN'),
    );
  });

  it('allows an explicitly public route without a principal', () => {
    assert.equal(
      guard.canActivate(makeContext(makeRequest(), DecoratedController.prototype.publicRoute)),
      true,
    );
  });

  it('requires a principal on an explicitly authenticated-only route', () => {
    const handler = DecoratedController.prototype.authenticatedRoute;

    assert.equal(Reflect.getMetadata(AUTHENTICATED_ONLY_ROUTE_METADATA, handler), true);
    assert.throws(
      () => guard.canActivate(makeContext(makeRequest(), handler)),
      assertSafeError('AUTHENTICATION_REQUIRED'),
    );

    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });
    assert.equal(guard.canActivate(makeContext(request, handler)), true);
  });

  it('denies routes with ambiguous access classifications', () => {
    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });

    assert.throws(
      () => guard.canActivate(makeContext(request, DecoratedController.prototype.ambiguousRoute)),
      assertSafeError('FORBIDDEN'),
    );
  });

  it('reads an immutable principal-scoped requirement from the decorator', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_REQUIREMENT_METADATA,
      DecoratedController.prototype.protectedRoute,
    ) as PermissionRequirementMetadata;

    assert.deepEqual(metadata, {
      permission: 'orders.read',
      scope: 'PRINCIPAL',
      minimumAssurance: 'PRIMARY',
    });
    assert.equal(Object.isFrozen(metadata), true);
  });

  it('rejects a protected route when no authenticated principal is attached', () => {
    assert.throws(
      () =>
        guard.canActivate(
          makeAuthorizationContext(makeRequest(), {
            permission: 'orders.read',
            scope: 'PRINCIPAL',
            minimumAssurance: 'PRIMARY',
          }),
        ),
      assertSafeError('AUTHENTICATION_REQUIRED'),
    );
  });

  it('authorizes matching permission, scope, and assurance', () => {
    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });

    assert.equal(
      guard.canActivate(
        makeAuthorizationContext(request, {
          permission: 'orders.read',
          scope: 'PRINCIPAL',
          minimumAssurance: 'PRIMARY',
        }),
      ),
      true,
    );
  });

  it('maps missing permission to a non-revealing forbidden error', () => {
    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });

    assert.throws(
      () =>
        guard.canActivate(
          makeAuthorizationContext(request, {
            permission: 'orders.write',
            scope: 'PRINCIPAL',
            minimumAssurance: 'PRIMARY',
          }),
        ),
      assertSafeError('FORBIDDEN'),
    );
  });

  it('maps a mismatched authorization scope to forbidden', () => {
    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });

    assert.throws(
      () =>
        guard.canActivate(
          makeAuthorizationContext(request, {
            permission: 'orders.read',
            scope: { type: 'SELLER', id: 'seller-2' },
            minimumAssurance: 'PRIMARY',
          }),
        ),
      assertSafeError('FORBIDDEN'),
    );
  });

  it('maps insufficient assurance to an explicit step-up error', () => {
    const request = makeRequest();
    Object.defineProperty(request, 'principal', { value: principal });

    assert.throws(
      () =>
        guard.canActivate(
          makeAuthorizationContext(request, {
            permission: 'orders.read',
            scope: 'PRINCIPAL',
            minimumAssurance: 'MFA',
          }),
        ),
      assertSafeError('STEP_UP_AUTH_REQUIRED'),
    );
  });
});
