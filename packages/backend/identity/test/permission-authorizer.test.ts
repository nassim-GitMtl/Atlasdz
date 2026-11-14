import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PermissionAuthorizer, type Principal } from '../src/index.js';
import { GLOBAL_SCOPE, OTHER_SELLER_SCOPE, SELLER_SCOPE, makePrincipal } from './support.js';

const authorizer = new PermissionAuthorizer();

describe('PermissionAuthorizer', () => {
  it('allows a global grant for both global and scoped operations', () => {
    const principal: Principal = {
      ...makePrincipal(),
      scope: GLOBAL_SCOPE,
      permissionGrants: [{ permission: 'orders.read', scope: GLOBAL_SCOPE }],
    };

    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: GLOBAL_SCOPE,
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: true },
    );
    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: SELLER_SCOPE,
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: true },
    );
  });

  it('allows an exact scoped grant and rejects cross-scope access', () => {
    const principal = makePrincipal();

    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: SELLER_SCOPE,
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: true },
    );
    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: OTHER_SELLER_SCOPE,
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: false, code: 'SCOPE_MISMATCH' },
    );
    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: { type: 'WAREHOUSE', id: 'warehouse-1' },
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: false, code: 'SCOPE_MISMATCH' },
    );
    assert.deepEqual(
      authorizer.authorize(principal, {
        permission: 'orders.read',
        scope: GLOBAL_SCOPE,
        minimumAssurance: 'PRIMARY',
      }),
      { allowed: false, code: 'SCOPE_MISMATCH' },
    );
  });

  it('denies an absent permission before considering scope or assurance', () => {
    assert.deepEqual(
      authorizer.authorize(makePrincipal(), {
        permission: 'orders.cancel',
        scope: SELLER_SCOPE,
        minimumAssurance: 'MFA',
      }),
      { allowed: false, code: 'PERMISSION_MISSING' },
    );
  });

  it('enforces the requested assurance without embedding a recency policy', () => {
    const primaryPrincipal: Principal = {
      ...makePrincipal(),
      assuranceLevel: 'PRIMARY',
      mfaCompletedAt: null,
    };
    assert.deepEqual(
      authorizer.authorize(primaryPrincipal, {
        permission: 'orders.read',
        scope: SELLER_SCOPE,
        minimumAssurance: 'MFA',
      }),
      { allowed: false, code: 'ASSURANCE_INSUFFICIENT' },
    );

    const malformedMfaPrincipal: Principal = {
      ...makePrincipal(),
      mfaCompletedAt: null,
    };
    assert.deepEqual(
      authorizer.authorize(malformedMfaPrincipal, {
        permission: 'orders.read',
        scope: SELLER_SCOPE,
        minimumAssurance: 'MFA',
      }),
      { allowed: false, code: 'ASSURANCE_INSUFFICIENT' },
    );

    assert.deepEqual(
      authorizer.authorize(makePrincipal(), {
        permission: 'orders.read',
        scope: SELLER_SCOPE,
        minimumAssurance: 'MFA',
      }),
      { allowed: true },
    );
  });
});
