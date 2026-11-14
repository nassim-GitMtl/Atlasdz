import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { runMigrations } from '@atlas/database';
import {
  PrincipalResolver,
  type SessionPersistenceContext,
  type VerifiedAccessClaims,
} from '@atlas/identity';
import { Client, Pool } from 'pg';

import {
  PostgresIdentityAuthorizationRepository,
  PostgresRefreshSessionRepository,
  PostgresSessionRepository,
} from '../../src/index.js';

interface Fixture {
  readonly userId: string;
  readonly foreignUserId: string;
  readonly sessionId: string;
  readonly currentFamilyId: string;
  readonly otherFamilyIds: readonly [string, string];
  readonly foreignFamilyId: string;
  readonly roleCode: string;
  readonly claims: VerifiedAccessClaims;
  readonly context: SessionPersistenceContext;
}

interface RefreshFixture {
  readonly userId: string;
  readonly familyId: string;
  readonly sessionId: string;
  readonly tokenDigest: Buffer;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

const quotedDatabaseName = (value: string): string => {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error('Unsafe temporary database name');
  }
  return `"${value}"`;
};

const insertSession = async (
  pool: Pool,
  values: {
    readonly id: string;
    readonly userId: string;
    readonly familyId: string;
    readonly deviceLabel: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  },
): Promise<void> => {
  await pool.query(
    `INSERT INTO identity.session_families (
       id, user_id, issued_session_epoch, actor_type, scope_type,
       scope_id, created_at, expires_at
     ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL, $3, $4)`,
    [values.familyId, values.userId, values.issuedAt, values.expiresAt],
  );
  await pool.query(
    `INSERT INTO identity.sessions (
       id, user_id, family_id, token_hash, device_label, assurance_level,
       issued_at, expires_at, last_seen_at, issued_session_epoch,
       actor_type, scope_type, scope_id
     ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', $6, $7, $6, 1, 'customer', 'GLOBAL', NULL)`,
    [
      values.id,
      values.userId,
      values.familyId,
      randomBytes(32),
      values.deviceLabel,
      values.issuedAt,
      values.expiresAt,
    ],
  );
};

const createRefreshFixture = async (pool: Pool): Promise<RefreshFixture> => {
  const userId = randomUUID();
  const familyId = randomUUID();
  const sessionId = randomUUID();
  const tokenDigest = randomBytes(32);
  const issuedAt = new Date(Date.now() - 60_000);
  const expiresAt = new Date(Date.now() + 60 * 60_000);

  await pool.query(
    `INSERT INTO identity.users (id, status, session_epoch)
     VALUES ($1, 'ACTIVE', 1)`,
    [userId],
  );
  await pool.query(
    `INSERT INTO identity.session_families (
       id, user_id, issued_session_epoch, actor_type, scope_type,
       scope_id, created_at, expires_at
     ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL, $3, $4)`,
    [familyId, userId, issuedAt, expiresAt],
  );
  await pool.query(
    `INSERT INTO identity.sessions (
       id, user_id, family_id, token_hash, device_label, device_hash,
       assurance_level, issued_at, expires_at, last_seen_at,
       issued_session_epoch, actor_type, scope_type, scope_id
     ) VALUES (
       $1, $2, $3, $4, 'Synthetic refresh browser', $5,
       'PRIMARY', $6, $7, $6, 1, 'customer', 'GLOBAL', NULL
     )`,
    [sessionId, userId, familyId, tokenDigest, randomBytes(32), issuedAt, expiresAt],
  );

  return { userId, familyId, sessionId, tokenDigest, issuedAt, expiresAt };
};

const refreshCommand = (fixture: RefreshFixture) => ({
  presentedTokenDigest: new Uint8Array(fixture.tokenDigest),
  successorSessionId: randomUUID(),
  successorTokenDigest: new Uint8Array(randomBytes(32)),
  correlationId: randomUUID(),
});

const createFixture = async (pool: Pool): Promise<Fixture> => {
  const suffix = randomBytes(8).toString('hex').toUpperCase();
  const userId = randomUUID();
  const foreignUserId = randomUUID();
  const sessionId = randomUUID();
  const currentFamilyId = randomUUID();
  const otherFamilyIds = [randomUUID(), randomUUID()] as const;
  const foreignFamilyId = randomUUID();
  const roleId = randomUUID();
  const permissionId = randomUUID();
  const assignmentId = randomUUID();
  const grantId = randomUUID();
  const roleCode = `CUSTOMER_${suffix}`;
  const permissionCode = `identity.session_read_${suffix.toLowerCase()}`;
  const now = Date.now();
  const issuedAt = new Date(now - 60 * 60_000);
  const expiresAt = new Date(now + 60 * 60_000);
  const claims: VerifiedAccessClaims = {
    tokenId: `synthetic-${suffix}`,
    userId,
    sessionId,
    sessionFamilyId: currentFamilyId,
    sessionEpoch: 1,
    actorType: 'customer',
    scope: { type: 'GLOBAL' },
    assuranceLevel: 'PRIMARY',
    issuedAt: new Date(now - 5 * 60_000),
    expiresAt: new Date(now + 5 * 60_000),
  };

  await pool.query(
    `INSERT INTO identity.users (id, status, session_epoch)
     VALUES ($1, 'ACTIVE', 1), ($2, 'ACTIVE', 1)`,
    [userId, foreignUserId],
  );
  await pool.query(
    `INSERT INTO identity.roles (id, code, actor_type, assignment_scope_type, description)
     VALUES ($1, $2, 'customer', 'GLOBAL', 'Synthetic identity integration role')`,
    [roleId, roleCode],
  );
  await pool.query(
    `INSERT INTO identity.permissions (id, code, description)
     VALUES ($1, $2, 'Synthetic identity integration permission')`,
    [permissionId, permissionCode],
  );
  await pool.query(
    `INSERT INTO identity.user_role_assignments
       (id, user_id, role_id, actor_type, scope_type, granted_reason, valid_from)
     VALUES ($1, $2, $3, 'customer', 'GLOBAL', 'Synthetic integration assignment', $4)`,
    [assignmentId, userId, roleId, issuedAt],
  );
  await pool.query(
    `INSERT INTO identity.role_permissions
       (id, role_id, permission_id, granted_at)
     VALUES ($1, $2, $3, $4)`,
    [grantId, roleId, permissionId, issuedAt],
  );

  await insertSession(pool, {
    id: sessionId,
    userId,
    familyId: currentFamilyId,
    deviceLabel: 'Synthetic current browser',
    issuedAt,
    expiresAt,
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId,
    familyId: otherFamilyIds[0],
    deviceLabel: 'Synthetic other browser',
    issuedAt,
    expiresAt,
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId,
    familyId: otherFamilyIds[1],
    deviceLabel: 'Synthetic other handset',
    issuedAt,
    expiresAt,
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId: foreignUserId,
    familyId: foreignFamilyId,
    deviceLabel: 'Synthetic foreign browser',
    issuedAt,
    expiresAt,
  });

  return {
    userId,
    foreignUserId,
    sessionId,
    currentFamilyId,
    otherFamilyIds,
    foreignFamilyId,
    roleCode,
    claims,
    context: {
      ownerUserId: userId,
      actor: {
        type: 'customer',
        id: userId,
        sessionId,
        effectiveRoleCodes: [roleCode],
        scope: { type: 'GLOBAL' },
        assuranceLevel: 'PRIMARY',
      },
      currentFamilyId,
      correlationId: randomUUID(),
    },
  };
};

describe('PostgreSQL identity adapters', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined) {
    throw new Error('DATABASE_URL is required for identity integration tests');
  }
  const databaseName = `atlas_identity_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let pool: Pool;

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quotedDatabaseName(databaseName)}`);
    await runMigrations(testUrl.toString());
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 });
  });

  after(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName(databaseName)}`);
    await admin.end();
  });

  it('resolves one authoritative principal snapshot and lists owned active families', async () => {
    const fixture = await createFixture(pool);
    const authorization = new PostgresIdentityAuthorizationRepository(pool);
    const result = await new PrincipalResolver(authorization, {
      now: () => new Date(),
    }).resolve(fixture.claims);

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.principal.roleCodes, [fixture.roleCode]);
    assert.equal(result.principal.permissionGrants.length, 1);
    assert.match(
      result.principal.permissionGrants[0]?.permission ?? '',
      /^identity\.session_read_/,
    );

    const sessions = new PostgresSessionRepository(pool);
    const families = await sessions.listCurrentFamilies(fixture.context);
    assert.equal(families.length, 3);
    assert.deepEqual(
      new Set(families.map((family) => family.familyId)),
      new Set([fixture.currentFamilyId, ...fixture.otherFamilyIds]),
    );
    assert.equal(
      families.some((family) => family.familyId === fixture.foreignFamilyId),
      false,
    );
  });

  it('rotates a refresh generation once and records predecessor replay exactly once', async () => {
    const fixture = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);
    const firstCommand = refreshCommand(fixture);

    const rotated = await refresh.rotateOrRecordReplayAtomically(firstCommand);
    assert.equal(rotated.kind, 'ROTATED');
    if (rotated.kind !== 'ROTATED') {
      return;
    }
    assert.equal(rotated.binding.sessionId, firstCommand.successorSessionId);
    assert.equal(rotated.binding.familyId, fixture.familyId);
    assert.equal(rotated.binding.userId, fixture.userId);
    assert.equal(rotated.binding.expiresAt.toISOString(), fixture.expiresAt.toISOString());

    const lineage = await pool.query<{
      parent_rotated_at: Date;
      child_issued_at: Date;
      inherited_binding: boolean;
      family_version: string;
      rotation_audit_count: string;
    }>(
      `SELECT
         parent.rotated_at AS parent_rotated_at,
         child.issued_at AS child_issued_at,
         (
           child.user_id = parent.user_id
           AND child.family_id = parent.family_id
           AND child.rotated_from_id = parent.id
           AND child.device_label IS NOT DISTINCT FROM parent.device_label
           AND child.device_hash IS NOT DISTINCT FROM parent.device_hash
           AND child.assurance_level = parent.assurance_level
           AND child.mfa_completed_at IS NOT DISTINCT FROM parent.mfa_completed_at
           AND child.issued_session_epoch = parent.issued_session_epoch
           AND child.actor_type = parent.actor_type
           AND child.scope_type = parent.scope_type
           AND child.scope_id IS NOT DISTINCT FROM parent.scope_id
         ) AS inherited_binding,
         family.row_version::text AS family_version,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.session_rotated'
            AND entity_id = family.id) AS rotation_audit_count
       FROM identity.sessions AS parent
       INNER JOIN identity.sessions AS child ON child.id = $1
       INNER JOIN identity.session_families AS family ON family.id = parent.family_id
       WHERE parent.id = $2`,
      [firstCommand.successorSessionId, fixture.sessionId],
    );
    assert.equal(
      lineage.rows[0]?.parent_rotated_at.toISOString(),
      lineage.rows[0]?.child_issued_at.toISOString(),
    );
    assert.equal(lineage.rows[0]?.inherited_binding, true);
    assert.equal(lineage.rows[0]?.family_version, '2');
    assert.equal(lineage.rows[0]?.rotation_audit_count, '1');

    const replayed = await refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture));
    assert.deepEqual(replayed, {
      kind: 'REFRESH_TOKEN_REUSED',
      evidenceRecorded: true,
    });

    const compromised = await pool.query<{
      family_revoked: boolean;
      family_reused: boolean;
      all_generations_revoked: boolean;
      replay_audit_count: string;
    }>(
      `SELECT
         family.revoked_at IS NOT NULL AS family_revoked,
         family.reuse_detected_at IS NOT NULL AS family_reused,
         bool_and(session.revoked_at IS NOT NULL) AS all_generations_revoked,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.refresh_reuse_detected'
            AND entity_id = family.id) AS replay_audit_count
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS session ON session.family_id = family.id
       WHERE family.id = $1
       GROUP BY family.id`,
      [fixture.familyId],
    );
    assert.deepEqual(compromised.rows[0], {
      family_revoked: true,
      family_reused: true,
      all_generations_revoked: true,
      replay_audit_count: '1',
    });

    const events = await pool.query<{
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT event_type, payload
       FROM platform.outbox_events
       WHERE aggregate_type = 'session_family' AND aggregate_id = $1
       ORDER BY event_type`,
      [fixture.familyId],
    );
    assert.deepEqual(
      events.rows.map((event) => event.event_type),
      ['identity.login_suspicious', 'identity.session_revoked'],
    );
    for (const event of events.rows) {
      assert.equal(event.payload['refreshToken'], undefined);
      assert.equal(event.payload['tokenDigest'], undefined);
    }

    assert.deepEqual(await refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture)), {
      kind: 'REFRESH_TOKEN_REUSED',
      evidenceRecorded: false,
    });
    const stableEvidence = await pool.query<{
      replay_audit_count: string;
      outbox_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.refresh_reuse_detected' AND entity_id = $1)
           AS replay_audit_count,
         (SELECT count(*)::text FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = $1)
           AS outbox_count`,
      [fixture.familyId],
    );
    assert.deepEqual(stableEvidence.rows[0], {
      replay_audit_count: '1',
      outbox_count: '2',
    });
  });

  it('serializes concurrent refresh calls into one rotation and one replay response', async () => {
    const fixture = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);

    const results = await Promise.all([
      refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture)),
      refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture)),
    ]);

    assert.equal(results.filter((result) => result.kind === 'ROTATED').length, 1);
    assert.equal(
      results.filter((result) => result.kind === 'REFRESH_TOKEN_REUSED' && result.evidenceRecorded)
        .length,
      1,
    );
    const state = await pool.query<{
      generation_count: string;
      family_compromised: boolean;
      all_generations_revoked: boolean;
      replay_audit_count: string;
      replay_event_count: string;
    }>(
      `SELECT
         count(session.id)::text AS generation_count,
         family.reuse_detected_at IS NOT NULL AS family_compromised,
         bool_and(session.revoked_at IS NOT NULL) AS all_generations_revoked,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.refresh_reuse_detected' AND entity_id = family.id)
           AS replay_audit_count,
         (SELECT count(*)::text FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = family.id)
           AS replay_event_count
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS session ON session.family_id = family.id
       WHERE family.id = $1
       GROUP BY family.id`,
      [fixture.familyId],
    );
    assert.deepEqual(state.rows[0], {
      generation_count: '2',
      family_compromised: true,
      all_generations_revoked: true,
      replay_audit_count: '1',
      replay_event_count: '2',
    });
  });

  it('serializes refresh against owned-family revocation without a lock inversion', async () => {
    const fixture = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);
    const sessions = new PostgresSessionRepository(pool);
    const context: SessionPersistenceContext = {
      ownerUserId: fixture.userId,
      actor: {
        type: 'customer',
        id: fixture.userId,
        sessionId: fixture.sessionId,
        effectiveRoleCodes: ['CUSTOMER'],
        scope: { type: 'GLOBAL' },
        assuranceLevel: 'PRIMARY',
      },
      currentFamilyId: fixture.familyId,
      correlationId: randomUUID(),
    };

    const [refreshResult, revokeResult] = await Promise.all([
      refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture)),
      sessions.revokeOwnedFamilyAtomically(context, fixture.familyId),
    ]);

    assert.equal(
      refreshResult.kind === 'ROTATED' || refreshResult.kind === 'SESSION_REVOKED',
      true,
    );
    assert.equal(revokeResult.found, true);
    const terminal = await pool.query<{
      family_revoked: boolean;
      all_generations_revoked: boolean;
      active_generation_count: string;
    }>(
      `SELECT
         family.revoked_at IS NOT NULL AS family_revoked,
         bool_and(session.revoked_at IS NOT NULL) AS all_generations_revoked,
         count(session.id) FILTER (
           WHERE session.rotated_at IS NULL AND session.revoked_at IS NULL
         )::text AS active_generation_count
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS session ON session.family_id = family.id
       WHERE family.id = $1
       GROUP BY family.id`,
      [fixture.familyId],
    );
    assert.deepEqual(terminal.rows[0], {
      family_revoked: true,
      all_generations_revoked: true,
      active_generation_count: '0',
    });
  });

  it('timestamps revocation after a refresh committed later than the revoking transaction began', async () => {
    const fixture = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);
    const sessions = new PostgresSessionRepository({
      query: (text, values) => pool.query(text, values),
      connect: async () => {
        const client = await pool.connect();
        return {
          release: () => client.release(),
          query: async (text, values) => {
            const result = await client.query(text, values);
            if (text === 'BEGIN') {
              // Force the ordering that happens when revocation waits behind refresh's lock.
              const rotated = await refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture));
              assert.equal(rotated.kind, 'ROTATED');
            }
            return result;
          },
        };
      },
    });
    const result = await sessions.revokeOwnedFamilyAtomically(
      {
        ownerUserId: fixture.userId,
        actor: {
          type: 'customer',
          id: fixture.userId,
          sessionId: fixture.sessionId,
          effectiveRoleCodes: ['CUSTOMER'],
          scope: { type: 'GLOBAL' },
          assuranceLevel: 'PRIMARY',
        },
        currentFamilyId: fixture.familyId,
        correlationId: randomUUID(),
      },
      fixture.familyId,
    );
    assert.deepEqual(result, {
      found: true,
      counts: { revokedFamilyCount: 1, revokedSessionCount: 2 },
    });
    const state = await pool.query<{ valid: boolean }>(
      `SELECT bool_and(revoked_at IS NOT NULL AND revoked_at >= issued_at) AS valid
       FROM identity.sessions WHERE family_id = $1`,
      [fixture.familyId],
    );
    assert.equal(state.rows[0]?.valid, true);
  });

  it('rolls replay, compromise, and audit back when outbox evidence conflicts', async () => {
    const fixture = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);
    const firstCommand = refreshCommand(fixture);
    const rotated = await refresh.rotateOrRecordReplayAtomically(firstCommand);
    assert.equal(rotated.kind, 'ROTATED');

    const version = await pool.query<{ row_version: string }>(
      `SELECT row_version::text AS row_version
       FROM identity.session_families
       WHERE id = $1`,
      [fixture.familyId],
    );
    const conflictingVersion = Number(version.rows[0]?.row_version) + 1;
    await pool.query(
      `INSERT INTO platform.outbox_events (
         event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
         aggregate_version, payload, actor_type, actor_id, correlation_id
       ) VALUES (
         $1, 'identity.session_revoked', 1, 'atlas-identity-test',
         'session_family', $2, $3, '{}'::jsonb, 'service', $4, $5
       )`,
      [randomUUID(), fixture.familyId, conflictingVersion, fixture.userId, randomUUID()],
    );

    await assert.rejects(
      refresh.rotateOrRecordReplayAtomically(refreshCommand(fixture)),
      (error: unknown) =>
        (error as { readonly constraint?: string }).constraint ===
        'outbox_events_aggregate_version_idx',
    );

    const preserved = await pool.query<{
      family_revoked_at: Date | null;
      family_reuse_detected_at: Date | null;
      parent_reuse_detected_at: Date | null;
      child_revoked_at: Date | null;
      replay_audit_count: string;
      suspicious_event_count: string;
    }>(
      `SELECT
         family.revoked_at AS family_revoked_at,
         family.reuse_detected_at AS family_reuse_detected_at,
         parent.reuse_detected_at AS parent_reuse_detected_at,
         child.revoked_at AS child_revoked_at,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.refresh_reuse_detected' AND entity_id = family.id)
           AS replay_audit_count,
         (SELECT count(*)::text FROM platform.outbox_events
          WHERE event_type = 'identity.login_suspicious' AND aggregate_id = family.id)
           AS suspicious_event_count
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS parent ON parent.id = $2
       INNER JOIN identity.sessions AS child ON child.id = $3
       WHERE family.id = $1`,
      [fixture.familyId, fixture.sessionId, firstCommand.successorSessionId],
    );
    assert.deepEqual(preserved.rows[0], {
      family_revoked_at: null,
      family_reuse_detected_at: null,
      parent_reuse_detected_at: null,
      child_revoked_at: null,
      replay_audit_count: '0',
      suspicious_event_count: '0',
    });
  });

  it('rolls predecessor rotation back when successor credential material collides', async () => {
    const fixture = await createRefreshFixture(pool);
    const collision = await createRefreshFixture(pool);
    const refresh = new PostgresRefreshSessionRepository(pool);
    const successorSessionId = randomUUID();

    await assert.rejects(
      refresh.rotateOrRecordReplayAtomically({
        presentedTokenDigest: new Uint8Array(fixture.tokenDigest),
        successorSessionId,
        successorTokenDigest: new Uint8Array(collision.tokenDigest),
        correlationId: randomUUID(),
      }),
      (error: unknown) =>
        (error as { readonly constraint?: string }).constraint === 'sessions_token_hash_key',
    );

    const preserved = await pool.query<{
      parent_rotated_at: Date | null;
      family_version: string;
      successor_count: string;
      audit_count: string;
    }>(
      `SELECT
         parent.rotated_at AS parent_rotated_at,
         family.row_version::text AS family_version,
         (SELECT count(*)::text FROM identity.sessions WHERE id = $2) AS successor_count,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE action = 'identity.session_rotated' AND entity_id = family.id) AS audit_count
       FROM identity.sessions AS parent
       INNER JOIN identity.session_families AS family ON family.id = parent.family_id
       WHERE parent.id = $1`,
      [fixture.sessionId, successorSessionId],
    );
    assert.deepEqual(preserved.rows[0], {
      parent_rotated_at: null,
      family_version: '1',
      successor_count: '0',
      audit_count: '0',
    });
  });

  it('makes foreign and missing families indistinguishable and serializes duplicate revocation', async () => {
    const fixture = await createFixture(pool);
    const sessions = new PostgresSessionRepository(pool);

    assert.deepEqual(
      await sessions.revokeOwnedFamilyAtomically(fixture.context, fixture.foreignFamilyId),
      { found: false },
    );
    assert.deepEqual(await sessions.revokeOwnedFamilyAtomically(fixture.context, randomUUID()), {
      found: false,
    });

    const concurrent = await Promise.all([
      sessions.revokeOwnedFamilyAtomically(fixture.context, fixture.otherFamilyIds[0]),
      sessions.revokeOwnedFamilyAtomically(fixture.context, fixture.otherFamilyIds[0]),
    ]);
    const counts = concurrent
      .map((entry) => (entry.found ? entry.counts.revokedFamilyCount : -1))
      .sort();
    assert.deepEqual(counts, [0, 1]);

    const evidence = await pool.query<{
      audit_count: string;
      outbox_count: string;
      payload: { sessionId?: string; token?: string };
    }>(
      `SELECT
         (SELECT count(*)::text FROM platform.audit_events
          WHERE entity_type = 'session_family' AND entity_id = $1) AS audit_count,
         (SELECT count(*)::text FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = $1
            AND event_type = 'identity.session_revoked' AND event_version = 1) AS outbox_count,
         (SELECT payload FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = $1) AS payload`,
      [fixture.otherFamilyIds[0]],
    );
    assert.equal(evidence.rows[0]?.audit_count, '1');
    assert.equal(evidence.rows[0]?.outbox_count, '1');
    assert.equal(evidence.rows[0]?.payload.sessionId, fixture.otherFamilyIds[0]);
    assert.equal(evidence.rows[0]?.payload.token, undefined);

    const authorization = new PostgresIdentityAuthorizationRepository(pool);
    const revokedPrincipal = await new PrincipalResolver(authorization, {
      now: () => new Date(),
    }).resolve({
      ...fixture.claims,
      sessionId:
        (
          await pool.query<{ id: string }>(
            `SELECT id::text
           FROM identity.sessions
           WHERE user_id = $1 AND family_id = $2
           ORDER BY issued_at DESC
           LIMIT 1`,
            [fixture.userId, fixture.otherFamilyIds[0]],
          )
        ).rows[0]?.id ?? randomUUID(),
      sessionFamilyId: fixture.otherFamilyIds[0],
    });
    assert.deepEqual(revokedPrincipal, { ok: false, code: 'SESSION_REVOKED' });

    await assert.rejects(
      pool.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, device_label, assurance_level,
           issued_at, expires_at, last_seen_at, issued_session_epoch,
           actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', $6, $7, $6, 1,
           'customer', 'GLOBAL', NULL)`,
        [
          randomUUID(),
          fixture.userId,
          fixture.otherFamilyIds[0],
          randomBytes(32),
          'Synthetic prohibited replacement',
          new Date(),
          new Date(Date.now() + 30 * 60_000),
        ],
      ),
      (error: unknown) =>
        (error as { readonly constraint?: string }).constraint === 'sessions_family_active_check',
    );
  });

  it('revokes every other owned family while preserving current and foreign families', async () => {
    const fixture = await createFixture(pool);
    const sessions = new PostgresSessionRepository(pool);

    assert.deepEqual(await sessions.revokeOtherFamiliesAtomically(fixture.context), {
      revokedFamilyCount: 2,
      revokedSessionCount: 2,
    });

    const states = await pool.query<{
      family_id: string;
      family_revoked: boolean;
      sessions_revoked: boolean;
    }>(
      `SELECT
         family.id::text AS family_id,
         family.revoked_at IS NOT NULL AS family_revoked,
         bool_and(session.revoked_at IS NOT NULL) AS sessions_revoked
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS session
         ON session.user_id = family.user_id AND session.family_id = family.id
       WHERE family.id = ANY($1::uuid[])
       GROUP BY family.id
       ORDER BY family.id`,
      [[fixture.currentFamilyId, ...fixture.otherFamilyIds, fixture.foreignFamilyId]],
    );
    const stateByFamily = new Map(states.rows.map((row) => [row.family_id, row]));
    assert.deepEqual(stateByFamily.get(fixture.currentFamilyId), {
      family_id: fixture.currentFamilyId,
      family_revoked: false,
      sessions_revoked: false,
    });
    for (const familyId of fixture.otherFamilyIds) {
      assert.deepEqual(stateByFamily.get(familyId), {
        family_id: familyId,
        family_revoked: true,
        sessions_revoked: true,
      });
    }
    assert.deepEqual(stateByFamily.get(fixture.foreignFamilyId), {
      family_id: fixture.foreignFamilyId,
      family_revoked: false,
      sessions_revoked: false,
    });
  });

  it('rolls back session and audit state when the outbox write cannot commit', async () => {
    const fixture = await createFixture(pool);
    const targetFamilyId = fixture.otherFamilyIds[0];
    await pool.query(
      `INSERT INTO platform.outbox_events
        (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
         aggregate_version, payload, actor_type, actor_id, correlation_id)
       VALUES ($1, 'identity.session_revoked', 1, 'atlas-identity-test', 'session_family',
         $2, 2, '{}'::jsonb, 'service', $3, $4)`,
      [randomUUID(), targetFamilyId, fixture.userId, randomUUID()],
    );

    const sessions = new PostgresSessionRepository(pool);
    await assert.rejects(
      sessions.revokeOwnedFamilyAtomically(fixture.context, targetFamilyId),
      (error: unknown) =>
        (error as { readonly constraint?: string }).constraint ===
        'outbox_events_aggregate_version_idx',
    );

    const state = await pool.query<{
      family_revoked_at: Date | null;
      session_revoked_at: Date | null;
      audit_count: string;
    }>(
      `SELECT
         family.revoked_at AS family_revoked_at,
         session.revoked_at AS session_revoked_at,
         (SELECT count(*)::text FROM platform.audit_events
          WHERE entity_type = 'session_family' AND entity_id = family.id) AS audit_count
       FROM identity.session_families AS family
       INNER JOIN identity.sessions AS session
         ON session.user_id = family.user_id AND session.family_id = family.id
       WHERE family.user_id = $1 AND family.id = $2`,
      [fixture.userId, targetFamilyId],
    );
    assert.equal(state.rows[0]?.family_revoked_at, null);
    assert.equal(state.rows[0]?.session_revoked_at, null);
    assert.equal(state.rows[0]?.audit_count, '0');
  });
});
