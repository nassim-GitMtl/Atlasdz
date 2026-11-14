import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { SYNTHETIC_CATALOG_IDS } from '@atlas/catalog';
import type { Pool } from 'pg';
import { createLocalCatalogIdentity } from '../src/identity/local-catalog-identity.js';

const token = `atlas-local-catalog-v1.${Buffer.alloc(32, 7).toString('base64url')}`;
const sellerUserId = '70000000-0000-4000-8000-000000000001';
const issuedAt = new Date('2026-10-07T12:00:00.000Z');
const expiresAt = new Date('2026-10-07T12:30:00.000Z');
const sellerRow = {
  id: '70000000-0000-4000-8000-000000000101',
  user_id: sellerUserId,
  family_id: '70000000-0000-4000-8000-000000000102',
  issued_session_epoch: '3',
  actor_type: 'seller_user',
  scope_type: 'SELLER',
  scope_id: SYNTHETIC_CATALOG_IDS.sellers[0],
  issued_at: issuedAt,
  expires_at: expiresAt,
};

type QueryCall = { sql: string; values: unknown[] };
function mockPool(answer: (call: QueryCall) => unknown[]) {
  const calls: QueryCall[] = [];
  let connections = 0;
  let releases = 0;
  const query = async (sql: string, values: unknown[] = []) => {
    const call = { sql, values };
    calls.push(call);
    const rows = answer(call);
    return { rows, rowCount: rows.length };
  };
  return {
    pool: {
      query,
      connect: async () => {
        connections += 1;
        return { query, release: () => (releases += 1) };
      },
    } as unknown as Pool,
    calls,
    get connections() {
      return connections;
    },
    get releases() {
      return releases;
    },
  };
}

function freshFixtureAnswer({ sql }: QueryCall): unknown[] {
  if (sql.includes('JOIN identity.user_role_assignments a ON a.user_id = u.id')) {
    return [{ id: SYNTHETIC_CATALOG_IDS.adminUserId }];
  }
  if (sql.includes('FROM sellers.sellers')) return [{ id: SYNTHETIC_CATALOG_IDS.sellers[0] }];
  if (sql.includes('FROM identity.permissions')) {
    return [{ id: '70000000-0000-4000-8000-000000000201' }];
  }
  if (sql.startsWith('SELECT session_epoch')) return [{ session_epoch: '1' }];
  if (sql.includes("interval '30 minutes'")) {
    return [{ issued_at: issuedAt, expires_at: expiresAt }];
  }
  return [];
}

describe('explicit LOCAL/TEST catalog identity harness', () => {
  it('rejects every nonlocal environment before connecting or querying', () => {
    const db = mockPool(() => []);
    for (const environment of ['production', 'staging', 'development', 'LOCAL', '', 'preview']) {
      assert.throws(
        () => createLocalCatalogIdentity(db.pool, environment),
        /restricted to LOCAL and TEST/,
      );
    }
    assert.equal(db.connections, 0);
    assert.equal(db.calls.length, 0);
  });

  it('rejects nonlocal namespaces, malformed credentials and noncanonical base64 before querying', async () => {
    const db = mockPool(() => []);
    const harness = createLocalCatalogIdentity(db.pool, 'test');
    for (const candidate of [
      '',
      'Bearer secret',
      'ordinary-production-token',
      'atlas-local-catalog-v1.short',
      `${token}=`,
      `${token.slice(0, -1)}B`,
    ]) {
      assert.deepEqual(await harness.credentialVerifier.verify(candidate), {
        ok: false,
        code: 'CREDENTIAL_REJECTED',
      });
    }
    assert.equal(db.calls.length, 0);
  });

  it('uses only a digest for lookup and derives fixture claims from authoritative rows', async () => {
    const db = mockPool(() => [sellerRow]);
    const result = await createLocalCatalogIdentity(db.pool, 'local').credentialVerifier.verify(
      token,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.claims.userId, sellerUserId);
    assert.equal(result.claims.sessionEpoch, 3);
    assert.equal(result.claims.sessionId, sellerRow.id);
    assert.deepEqual(result.claims.scope, {
      type: 'SELLER',
      id: SYNTHETIC_CATALOG_IDS.sellers[0],
    });
    assert.equal(result.claims.issuedAt, issuedAt);
    assert.equal(result.claims.expiresAt, expiresAt);
    assert.ok(!JSON.stringify(result).includes(token));
    assert.deepEqual(db.calls[0]?.values[0], createHash('sha256').update(token).digest());
    assert.ok(!JSON.stringify(db.calls).includes(token));
    assert.match(
      String(db.calls[0]?.values[2]),
      /synthetic MFA fixture; no real authentication or MFA/,
    );
  });

  it('rejects a foreign seller scope, unknown fixture user, and unsafe epoch', async () => {
    for (const row of [
      { ...sellerRow, scope_id: SYNTHETIC_CATALOG_IDS.sellers[1] },
      { ...sellerRow, user_id: '70000000-0000-4000-8000-000000000999' },
      { ...sellerRow, issued_session_epoch: '9007199254740993' },
      { ...sellerRow, actor_type: 'staff' },
    ]) {
      const db = mockPool(() => [row]);
      assert.deepEqual(
        await createLocalCatalogIdentity(db.pool, 'test').credentialVerifier.verify(token),
        { ok: false, code: 'CREDENTIAL_REJECTED' },
      );
    }
  });

  it('rejects missing/revoked credentials and redacts database failures', async () => {
    for (const answer of [
      () => [],
      () => {
        throw new Error(`database failure ${token}`);
      },
    ]) {
      const db = mockPool(answer);
      assert.deepEqual(
        await createLocalCatalogIdentity(db.pool, 'test').credentialVerifier.verify(token),
        { ok: false, code: 'CREDENTIAL_REJECTED' },
      );
    }
  });

  it('mints a bounded opaque session, persists only hashes, and labels synthetic MFA', async () => {
    const db = mockPool(freshFixtureAnswer);
    const result = await createLocalCatalogIdentity(db.pool, 'test').createSession('seller');
    assert.match(result.accessToken, /^atlas-local-catalog-v1\.[A-Za-z0-9_-]{43}$/);
    assert.equal(result.expiresAt, expiresAt.toISOString());
    assert.ok(!JSON.stringify(db.calls).includes(result.accessToken));
    const sessionInsert = db.calls.find((call) =>
      call.sql.includes('INSERT INTO identity.sessions'),
    );
    assert.ok(sessionInsert);
    assert.deepEqual(
      sessionInsert.values[3],
      createHash('sha256').update(result.accessToken).digest(),
    );
    assert.equal(sessionInsert.values[1], sellerUserId);
    assert.equal(sessionInsert.values[11], SYNTHETIC_CATALOG_IDS.sellers[0]);
    assert.match(String(sessionInsert.values[4]), /synthetic MFA fixture/);
    assert.equal(db.calls.at(-1)?.sql, 'COMMIT');
    assert.equal(db.releases, 1);
  });

  it('uses the verified foundation admin and only explicit local staff grants', async () => {
    const db = mockPool(freshFixtureAnswer);
    await createLocalCatalogIdentity(db.pool, 'test').createSession('admin');
    assert.ok(!db.calls.some((call) => call.sql.includes('INSERT INTO identity.users')));
    const permissions = db.calls
      .filter((call) => call.sql.includes('FROM identity.permissions'))
      .flatMap((call) => call.values);
    assert.deepEqual(permissions, [
      'offer.approve',
      'support.escalations',
      'product.review',
      'review.moderate',
    ]);
    const sessionInsert = db.calls.find((call) =>
      call.sql.includes('INSERT INTO identity.sessions'),
    );
    assert.equal(sessionInsert?.values[1], SYNTHETIC_CATALOG_IDS.adminUserId);
    assert.equal(sessionInsert?.values[9], 'staff');
    assert.equal(sessionInsert?.values[11], null);
  });

  it('rolls back before granting access when foundation provenance is missing', async () => {
    const db = mockPool(() => []);
    await assert.rejects(
      createLocalCatalogIdentity(db.pool, 'test').createSession('admin'),
      /verify local fixture data/,
    );
    assert.ok(!db.calls.some((call) => call.sql.includes('INSERT INTO')));
    assert.equal(db.calls.at(-1)?.sql, 'ROLLBACK');
    assert.equal(db.releases, 1);
  });

  it('rolls back conflicting reserved roles without changing or granting them', async () => {
    const db = mockPool((call) =>
      call.sql.includes('FROM identity.roles WHERE id =')
        ? [{ id: 'unrelated-role', code: 'REAL_ADMIN' }]
        : freshFixtureAnswer(call),
    );
    await assert.rejects(
      createLocalCatalogIdentity(db.pool, 'test').createSession('admin'),
      /verify local fixture data/,
    );
    assert.ok(!db.calls.some((call) => call.sql.includes('INSERT INTO')));
    assert.equal(db.calls.at(-1)?.sql, 'ROLLBACK');
  });

  it('rolls back the whole fixture transaction on session persistence failure without leaking tokens', async () => {
    const db = mockPool((call) => {
      if (call.sql.includes('INSERT INTO identity.sessions')) throw new Error(`private ${token}`);
      return freshFixtureAnswer(call);
    });
    await assert.rejects(
      createLocalCatalogIdentity(db.pool, 'test').createSession('seller'),
      (error: unknown) => error instanceof Error && !error.message.includes(token),
    );
    assert.equal(db.calls.at(-1)?.sql, 'ROLLBACK');
    assert.ok(!db.calls.some((call) => call.sql === 'COMMIT'));
    assert.equal(db.releases, 1);
  });
});
