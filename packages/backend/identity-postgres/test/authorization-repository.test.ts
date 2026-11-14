import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  IdentityDataIntegrityError,
  PostgresIdentityAuthorizationRepository,
} from '../src/index.js';
import { queryRows, ScriptedQueryable } from './support.js';

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';
const familyId = '10000000-0000-4000-8000-000000000003';
const roleId = '10000000-0000-4000-8000-000000000004';
const assignmentId = '10000000-0000-4000-8000-000000000005';
const permissionId = '10000000-0000-4000-8000-000000000006';
const grantId = '10000000-0000-4000-8000-000000000007';
const sellerId = '10000000-0000-4000-8000-000000000008';

const snapshotRow = {
  user: { id: userId, status: 'ACTIVE', sessionEpoch: '3' },
  session: {
    id: sessionId,
    userId,
    familyId,
    sessionEpoch: '3',
    actorType: 'seller_user',
    scopeType: 'SELLER',
    scopeId: sellerId,
    assuranceLevel: 'MFA',
    issuedAt: '2026-10-04T10:00:00.000Z',
    expiresAt: '2026-10-05T10:00:00.000Z',
    mfaCompletedAt: '2026-10-04T10:00:01.000Z',
    rotatedAt: null,
    revokedAt: null,
    reuseDetectedAt: null,
  },
  sessionFamily: {
    id: familyId,
    userId,
    sessionEpoch: '3',
    actorType: 'seller_user',
    scopeType: 'SELLER',
    scopeId: sellerId,
    createdAt: '2026-10-04T09:00:00.000Z',
    expiresAt: '2026-10-05T11:00:00.000Z',
    revokedAt: null,
    reuseDetectedAt: null,
  },
  assignments: [
    {
      id: assignmentId,
      userId,
      roleId,
      actorType: 'seller_user',
      scopeType: 'SELLER',
      scopeId: sellerId,
      validFrom: '2026-10-04T09:00:00.000Z',
      validUntil: null,
      revokedAt: null,
    },
  ],
  roles: [
    {
      id: roleId,
      code: 'SELLER_ADMIN',
      actorType: 'seller_user',
      assignmentScopeType: 'SELLER',
      status: 'ACTIVE',
    },
  ],
  rolePermissionGrants: [
    {
      id: grantId,
      roleId,
      permissionId,
      grantedAt: '2026-10-04T09:00:00.000Z',
      validUntil: null,
      revokedAt: null,
    },
  ],
  permissions: [{ id: permissionId, code: 'catalog.product.write', status: 'ACTIVE' }],
};

describe('PostgresIdentityAuthorizationRepository', () => {
  it('loads and strictly maps one point-in-time authorization snapshot', async () => {
    const database = new ScriptedQueryable([queryRows([snapshotRow])]);
    const repository = new PostgresIdentityAuthorizationRepository(database);

    const snapshot = await repository.loadAuthorizationSnapshot(userId, sessionId);

    assert.equal(snapshot.user?.sessionEpoch, 3);
    assert.equal(snapshot.session?.familyId, familyId);
    assert.equal(snapshot.sessionFamily?.id, familyId);
    assert.equal(snapshot.sessionFamily?.actorType, 'seller_user');
    assert.deepEqual(snapshot.session?.scope, { type: 'SELLER', id: sellerId });
    assert.equal(snapshot.session?.issuedAt.toISOString(), '2026-10-04T10:00:00.000Z');
    assert.equal(snapshot.assignments[0]?.roleId, roleId);
    assert.equal(snapshot.assignments[0]?.actorType, 'seller_user');
    assert.equal(snapshot.roles[0]?.code, 'SELLER_ADMIN');
    assert.equal(snapshot.roles[0]?.actorType, 'seller_user');
    assert.equal(snapshot.rolePermissionGrants[0]?.permissionId, permissionId);
    assert.equal(snapshot.permissions[0]?.code, 'catalog.product.write');
    assert.deepEqual(database.calls[0]?.values, [userId, sessionId]);
    assert.match(database.calls[0]?.text ?? '', /WITH selected_assignments/);
    assert.equal(database.remainingSteps(), 0);
  });

  it('treats malformed provider claim identifiers as unresolved without querying PostgreSQL', async () => {
    const database = new ScriptedQueryable([]);
    const repository = new PostgresIdentityAuthorizationRepository(database);

    const snapshot = await repository.loadAuthorizationSnapshot('not-a-uuid', sessionId);

    assert.equal(snapshot.user, null);
    assert.equal(snapshot.session, null);
    assert.deepEqual(snapshot.assignments, []);
    assert.equal(database.calls.length, 0);
  });

  it('fails closed when persisted authorization data has an invalid shape', async () => {
    const database = new ScriptedQueryable([
      queryRows([{ ...snapshotRow, session: { ...snapshotRow.session, sessionEpoch: 'NaN' } }]),
    ]);
    const repository = new PostgresIdentityAuthorizationRepository(database);

    await assert.rejects(
      repository.loadAuthorizationSnapshot(userId, sessionId),
      IdentityDataIntegrityError,
    );
  });

  it('rejects an impossible snapshot query cardinality', async () => {
    const database = new ScriptedQueryable([queryRows([])]);
    const repository = new PostgresIdentityAuthorizationRepository(database);

    await assert.rejects(repository.loadAuthorizationSnapshot(userId, sessionId), /invalid shape/);
  });
});
