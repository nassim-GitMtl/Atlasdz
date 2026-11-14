import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Client } from 'pg';

import {
  defaultMigrationsDirectory,
  GreenfieldBaselineRequiredError,
  runMigrations,
} from '../../src/migrations.js';
import { verifyFoundation } from '../../src/operations.js';

function quotedDatabaseName(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error('Unsafe temporary database name');
  }
  return `"${value}"`;
}

async function expectConstraintViolation(
  client: Client,
  query: string,
  values: readonly unknown[],
  expectedConstraint: string,
): Promise<void> {
  await client.query('SAVEPOINT expected_constraint_violation');
  try {
    await client.query(query, [...values]);
    assert.fail(`Expected PostgreSQL constraint ${expectedConstraint} to reject the statement`);
  } catch (error) {
    assert.equal(
      (error as { readonly constraint?: string }).constraint,
      expectedConstraint,
      `Expected PostgreSQL constraint ${expectedConstraint}`,
    );
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_constraint_violation');
  }
}

async function expectStatementConstraintViolation(
  client: Client,
  query: string,
  values: readonly unknown[],
  expectedConstraint: string,
): Promise<void> {
  await assert.rejects(client.query(query, [...values]), (error: unknown) => {
    assert.equal(
      (error as { readonly constraint?: string }).constraint,
      expectedConstraint,
      `Expected PostgreSQL constraint ${expectedConstraint}`,
    );
    return true;
  });
}

async function commitSchemaChanges(client: Client, statements: readonly string[]): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

describe('foundation database', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined) {
    throw new Error('DATABASE_URL is required for database integration tests');
  }
  const databaseName = `atlas_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quotedDatabaseName(databaseName)}`);
    await runMigrations(testUrl.toString());
  });

  after(async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName(databaseName)} WITH (FORCE)`);
    await admin.end();
  });

  it('applies the migration idempotently and verifies required controls', async () => {
    assert.deepEqual(await runMigrations(testUrl.toString()), []);
    await verifyFoundation(testUrl.toString());
  });

  it('rejects misplaced constraints, weakened indexes, and disabled lifecycle triggers', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      await commitSchemaChanges(client, [
        `ALTER TABLE identity.sessions
         RENAME CONSTRAINT sessions_no_self_rotation_check
         TO sessions_no_self_rotation_check_drifted`,
        `ALTER TABLE identity.users
         ADD CONSTRAINT sessions_no_self_rotation_check CHECK (true)`,
      ]);
      try {
        await assert.rejects(
          verifyFoundation(testUrl.toString()),
          /Required constraint is invalid: identity\.sessions\.sessions_no_self_rotation_check/,
        );
      } finally {
        await commitSchemaChanges(client, [
          `ALTER TABLE identity.users
           DROP CONSTRAINT sessions_no_self_rotation_check`,
          `ALTER TABLE identity.sessions
           RENAME CONSTRAINT sessions_no_self_rotation_check_drifted
           TO sessions_no_self_rotation_check`,
        ]);
      }

      await commitSchemaChanges(client, [
        `ALTER INDEX identity.sessions_one_current_generation_idx
         RENAME TO sessions_one_current_generation_idx_drifted`,
        `CREATE INDEX sessions_one_current_generation_idx
         ON identity.sessions (user_id, family_id)`,
      ]);
      try {
        await assert.rejects(
          verifyFoundation(testUrl.toString()),
          /Required current-session uniqueness index is invalid/,
        );
      } finally {
        await commitSchemaChanges(client, [
          'DROP INDEX identity.sessions_one_current_generation_idx',
          `ALTER INDEX identity.sessions_one_current_generation_idx_drifted
           RENAME TO sessions_one_current_generation_idx`,
        ]);
      }

      await commitSchemaChanges(client, [
        `ALTER TABLE identity.sessions
         DISABLE TRIGGER sessions_canonicalize_reuse_transition`,
      ]);
      try {
        await assert.rejects(
          verifyFoundation(testUrl.toString()),
          /Required trigger is invalid: identity\.sessions\.sessions_canonicalize_reuse_transition/,
        );
      } finally {
        await commitSchemaChanges(client, [
          `ALTER TABLE identity.sessions
           ENABLE TRIGGER sessions_canonicalize_reuse_transition`,
        ]);
      }

      await verifyFoundation(testUrl.toString());
    } finally {
      await client.end();
    }
  });

  it('rejects rotation after wall-clock family expiry inside a long transaction', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      const userId = randomUUID();
      const familyId = randomUUID();
      const sessionId = randomUUID();

      await client.query(
        `INSERT INTO identity.users (id, status, session_epoch)
         VALUES ($1, 'ACTIVE', 1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO identity.session_families (
           id, user_id, issued_session_epoch, actor_type, scope_type, scope_id,
           created_at, expires_at
         ) VALUES (
           $1, $2, 1, 'customer', 'GLOBAL', NULL,
           clock_timestamp() - interval '1 minute',
           clock_timestamp() + interval '1.5 seconds'
         )`,
        [familyId, userId],
      );
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id
         )
         SELECT $1, $2, family.id, $3, 'PRIMARY', family.created_at, family.expires_at,
           family.issued_session_epoch, family.actor_type, family.scope_type, family.scope_id
         FROM identity.session_families AS family
         WHERE family.id = $4`,
        [sessionId, userId, randomBytes(32), familyId],
      );

      await client.query('BEGIN');
      await client.query('SELECT pg_sleep(1.7)');
      await assert.rejects(
        client.query(
          `UPDATE identity.sessions
           SET rotated_at = transaction_timestamp()
           WHERE id = $1`,
          [sessionId],
        ),
        (error: unknown) =>
          (error as { readonly constraint?: string }).constraint ===
          'sessions_rotation_state_check',
      );
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });

  it('stops before locked 000002 when legacy outbox or inbox data requires a baseline', async () => {
    const legacyDatabaseName = `atlas_legacy_it_${randomBytes(8).toString('hex')}`;
    const legacyUrl = new URL(sourceUrl);
    legacyUrl.pathname = `/${legacyDatabaseName}`;
    const migrationDirectory = await mkdtemp(join(tmpdir(), 'atlas-legacy-migrations-'));
    let legacyClient: Client | undefined;

    await admin.query(`CREATE DATABASE ${quotedDatabaseName(legacyDatabaseName)}`);
    try {
      const foundationMigration = '000001_foundation.sql';
      await copyFile(
        resolve(defaultMigrationsDirectory(), foundationMigration),
        resolve(migrationDirectory, foundationMigration),
      );
      assert.deepEqual(await runMigrations(legacyUrl.toString(), migrationDirectory), ['000001']);

      legacyClient = new Client({ connectionString: legacyUrl.toString() });
      await legacyClient.connect();
      const outboxEventId = randomUUID();
      const inboxEventId = randomUUID();
      await legacyClient.query(
        `INSERT INTO identity.roles (id, code, assignment_scope_type, description)
         VALUES ($1, 'LEGACY_GLOBAL_ROLE', 'GLOBAL', 'Legacy role requires a reviewed baseline')`,
        [randomUUID()],
      );
      await legacyClient.query(
        `INSERT INTO platform.outbox_events
          (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
           aggregate_version, payload, correlation_id)
         VALUES ($1, 'legacy.event.v1', 1, 'atlas-legacy-test', 'legacy_record',
           $2, 1, '{}'::jsonb, $3)`,
        [outboxEventId, randomUUID(), randomUUID()],
      );
      await legacyClient.query(
        `INSERT INTO platform.inbox_messages
          (consumer_name, event_id, event_type, event_version, payload_hash)
         VALUES ('atlas-legacy-test', $1, 'legacy.event.v1', 1, $2)`,
        [inboxEventId, randomBytes(32)],
      );

      await assert.rejects(
        () => runMigrations(legacyUrl.toString()),
        (error: unknown) => {
          assert.ok(error instanceof GreenfieldBaselineRequiredError);
          assert.equal(error.migrationFileName, '000002_identity_control_plane.sql');
          assert.deepEqual(error.nonEmptyRelations, [
            'identity.roles',
            'platform.outbox_events',
            'platform.inbox_messages',
          ]);
          assert.match(error.message, /later migration cannot repair an unapplied 000002/);
          return true;
        },
      );

      const ledger = await legacyClient.query<{ version: string }>(
        'SELECT version FROM platform.schema_migrations ORDER BY version',
      );
      assert.deepEqual(
        ledger.rows.map((row) => row.version),
        ['000001'],
      );
      const preserved = await legacyClient.query<{
        inbox_count: string;
        outbox_count: string;
        actor_type_exists: boolean;
      }>(`
        SELECT
          (SELECT count(*)::text FROM platform.outbox_events) AS outbox_count,
          (SELECT count(*)::text FROM platform.inbox_messages) AS inbox_count,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'platform'
              AND table_name = 'outbox_events'
              AND column_name = 'actor_type'
          ) AS actor_type_exists
      `);
      assert.deepEqual(preserved.rows[0], {
        inbox_count: '1',
        outbox_count: '1',
        actor_type_exists: false,
      });
    } finally {
      await legacyClient?.end();
      await admin.query(
        `DROP DATABASE IF EXISTS ${quotedDatabaseName(legacyDatabaseName)} WITH (FORCE)`,
      );
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  });

  it('refuses to guess the actor audience of a pre-existing GLOBAL role', async () => {
    const stagedDatabaseName = `atlas_actor_mapping_it_${randomBytes(8).toString('hex')}`;
    const stagedUrl = new URL(sourceUrl);
    stagedUrl.pathname = `/${stagedDatabaseName}`;
    const migrationDirectory = await mkdtemp(join(tmpdir(), 'atlas-actor-migrations-'));
    let stagedClient: Client | undefined;

    await admin.query(`CREATE DATABASE ${quotedDatabaseName(stagedDatabaseName)}`);
    try {
      for (const fileName of ['000001_foundation.sql', '000002_identity_control_plane.sql']) {
        await copyFile(
          resolve(defaultMigrationsDirectory(), fileName),
          resolve(migrationDirectory, fileName),
        );
      }
      assert.deepEqual(await runMigrations(stagedUrl.toString(), migrationDirectory), [
        '000001',
        '000002',
      ]);

      stagedClient = new Client({ connectionString: stagedUrl.toString() });
      await stagedClient.connect();
      await stagedClient.query(
        `INSERT INTO identity.roles (id, code, assignment_scope_type, description)
         VALUES ($1, 'AMBIGUOUS_GLOBAL', 'GLOBAL', 'Requires an explicit actor mapping')`,
        [randomUUID()],
      );
      await copyFile(
        resolve(
          defaultMigrationsDirectory(),
          '000003_identity_actor_and_session_family_hardening.sql',
        ),
        resolve(migrationDirectory, '000003_identity_actor_and_session_family_hardening.sql'),
      );

      await assert.rejects(
        () => runMigrations(stagedUrl.toString(), migrationDirectory),
        /GLOBAL roles require an explicit customer-or-staff actor mapping/,
      );
      const state = await stagedClient.query<{
        versions: string[];
        actor_type_exists: boolean;
      }>(`
        SELECT
          ARRAY(SELECT version FROM platform.schema_migrations ORDER BY version) AS versions,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'identity'
              AND table_name = 'roles'
              AND column_name = 'actor_type'
          ) AS actor_type_exists
      `);
      assert.deepEqual(state.rows[0], {
        versions: ['000001', '000002'],
        actor_type_exists: false,
      });
    } finally {
      await stagedClient?.end();
      await admin.query(
        `DROP DATABASE IF EXISTS ${quotedDatabaseName(stagedDatabaseName)} WITH (FORCE)`,
      );
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  });

  it('backfills an all-rotated legacy family to a valid terminal family record', async () => {
    const stagedDatabaseName = `atlas_family_backfill_it_${randomBytes(8).toString('hex')}`;
    const stagedUrl = new URL(sourceUrl);
    stagedUrl.pathname = `/${stagedDatabaseName}`;
    const migrationDirectory = await mkdtemp(join(tmpdir(), 'atlas-family-migrations-'));
    let stagedClient: Client | undefined;

    await admin.query(`CREATE DATABASE ${quotedDatabaseName(stagedDatabaseName)}`);
    try {
      for (const fileName of ['000001_foundation.sql', '000002_identity_control_plane.sql']) {
        await copyFile(
          resolve(defaultMigrationsDirectory(), fileName),
          resolve(migrationDirectory, fileName),
        );
      }
      assert.deepEqual(await runMigrations(stagedUrl.toString(), migrationDirectory), [
        '000001',
        '000002',
      ]);

      stagedClient = new Client({ connectionString: stagedUrl.toString() });
      await stagedClient.connect();
      const userId = randomUUID();
      const familyId = randomUUID();
      const predecessorId = randomUUID();
      const successorId = randomUUID();
      const issuedAt = new Date(Date.now() - 2 * 60 * 60_000);
      const successorIssuedAt = new Date(Date.now() - 90 * 60_000);
      const predecessorRotatedAt = new Date(Date.now() - 90 * 60_000);
      const successorRotatedAt = new Date(Date.now() - 60 * 60_000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

      await stagedClient.query(
        `INSERT INTO identity.users (id, status, session_epoch)
         VALUES ($1, 'ACTIVE', 1)`,
        [userId],
      );
      await stagedClient.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
           rotated_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'PRIMARY', $5, $6, $7, 1, 'customer', 'GLOBAL', NULL)`,
        [
          predecessorId,
          userId,
          familyId,
          randomBytes(32),
          issuedAt,
          expiresAt,
          predecessorRotatedAt,
        ],
      );
      await stagedClient.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
           issued_at, expires_at, rotated_at, issued_session_epoch, actor_type,
           scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', $6, $7, $8, 1,
           'customer', 'GLOBAL', NULL)`,
        [
          successorId,
          userId,
          familyId,
          randomBytes(32),
          predecessorId,
          successorIssuedAt,
          expiresAt,
          successorRotatedAt,
        ],
      );
      await copyFile(
        resolve(
          defaultMigrationsDirectory(),
          '000003_identity_actor_and_session_family_hardening.sql',
        ),
        resolve(migrationDirectory, '000003_identity_actor_and_session_family_hardening.sql'),
      );

      assert.deepEqual(await runMigrations(stagedUrl.toString(), migrationDirectory), ['000003']);
      const family = await stagedClient.query<{
        revoked_at: Date | null;
        revoked_reason: string | null;
      }>(
        `SELECT revoked_at, revoked_reason
         FROM identity.session_families
         WHERE id = $1`,
        [familyId],
      );
      assert.equal(family.rows[0]?.revoked_at?.toISOString(), successorRotatedAt.toISOString());
      assert.equal(family.rows[0]?.revoked_reason, 'MIGRATED_REVOKED_FAMILY');
    } finally {
      await stagedClient?.end();
      await admin.query(
        `DROP DATABASE IF EXISTS ${quotedDatabaseName(stagedDatabaseName)} WITH (FORCE)`,
      );
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  });

  it('commits domain evidence and its outbox envelope atomically', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      const rolledBackEventId = randomUUID();
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO platform.audit_events
          (event_id, actor_type, action, outcome, entity_type, entity_id, correlation_id)
         VALUES ($1, 'service', 'foundation.atomicity_test', 'SUCCEEDED', 'test_record', $2, $3)`,
        [randomUUID(), randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO platform.outbox_events
          (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
           aggregate_version, payload, actor_type, correlation_id)
         VALUES ($1, 'foundation.atomicity_tested', 1, 'atlas-database-test', 'test_record',
           $2, 1, '{}'::jsonb, 'service', $3)`,
        [rolledBackEventId, randomUUID(), randomUUID()],
      );
      await client.query('ROLLBACK');
      const rolledBack = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM platform.outbox_events WHERE event_id = $1',
        [rolledBackEventId],
      );
      assert.equal(rolledBack.rows[0]?.count, '0');

      const committedEventId = randomUUID();
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO platform.audit_events
          (event_id, actor_type, action, outcome, entity_type, entity_id, correlation_id)
         VALUES ($1, 'service', 'foundation.atomicity_test', 'SUCCEEDED', 'test_record', $2, $3)`,
        [randomUUID(), randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO platform.outbox_events
          (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
           aggregate_version, payload, actor_type, correlation_id)
         VALUES ($1, 'foundation.atomicity_tested', 1, 'atlas-database-test', 'test_record',
           $2, 1, '{}'::jsonb, 'service', $3)`,
        [committedEventId, randomUUID(), randomUUID()],
      );
      await client.query('COMMIT');
      const committed = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM platform.outbox_events WHERE event_id = $1',
        [committedEventId],
      );
      assert.equal(committed.rows[0]?.count, '1');
    } finally {
      await client.end();
    }
  });

  it('enforces session claims, role scope, and canonical event versions in PostgreSQL', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const familyId = randomUUID();
      const sellerFamilyId = randomUUID();
      const sellerScopeId = randomUUID();
      const sellerPredecessorId = randomUUID();
      const globalRoleId = randomUUID();
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO identity.users (id, status, session_epoch)
         VALUES ($1, 'ACTIVE', 1), ($2, 'ACTIVE', 1)`,
        [userId, otherUserId],
      );

      await expectConstraintViolation(
        client,
        `INSERT INTO identity.sessions
          (id, user_id, family_id, token_hash, assurance_level, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id)
         VALUES ($1, $2, $3, $4, 'PRIMARY', transaction_timestamp() + interval '1 day',
           1, 'seller_user', 'SELLER', $5)`,
        [randomUUID(), userId, randomUUID(), randomBytes(32), randomUUID()],
        'sessions_privileged_mfa_check',
      );

      await expectConstraintViolation(
        client,
        `INSERT INTO identity.sessions
          (id, user_id, family_id, token_hash, assurance_level, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id)
         VALUES ($1, $2, $3, $4, 'PRIMARY', transaction_timestamp() + interval '1 day',
           1, 'customer', 'SELLER', $5)`,
        [randomUUID(), userId, randomUUID(), randomBytes(32), randomUUID()],
        'sessions_actor_scope_check',
      );

      await client.query(
        `INSERT INTO identity.session_families (
           id, user_id, issued_session_epoch, actor_type, scope_type, scope_id,
           created_at, expires_at
         ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL,
           transaction_timestamp(), transaction_timestamp() + interval '1 day')`,
        [familyId, userId],
      );
      await client.query(
        `INSERT INTO identity.sessions
          (id, user_id, family_id, token_hash, assurance_level, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id)
         VALUES ($1, $2, $3, $4, 'PRIMARY', transaction_timestamp() + interval '1 day',
           1, 'customer', 'GLOBAL', NULL)`,
        [randomUUID(), userId, familyId, randomBytes(32)],
      );
      await expectConstraintViolation(
        client,
        `INSERT INTO identity.sessions
          (id, user_id, family_id, token_hash, assurance_level, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id)
         VALUES ($1, $2, $3, $4, 'PRIMARY', transaction_timestamp() + interval '1 day',
           1, 'customer', 'GLOBAL', NULL)`,
        [randomUUID(), userId, familyId, randomBytes(32)],
        'sessions_single_root_check',
      );

      await client.query(
        `INSERT INTO identity.session_families (
           id, user_id, issued_session_epoch, actor_type, scope_type, scope_id,
           created_at, expires_at
         ) VALUES ($1, $2, 1, 'seller_user', 'SELLER', $3,
           transaction_timestamp() - interval '2 hours',
           transaction_timestamp() + interval '1 day')`,
        [sellerFamilyId, userId, sellerScopeId],
      );
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
           mfa_completed_at, rotated_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'MFA', transaction_timestamp() - interval '2 hours',
           transaction_timestamp() + interval '1 day',
           transaction_timestamp() - interval '2 hours',
           transaction_timestamp() - interval '30 minutes', 1, 'seller_user', 'SELLER', $5)`,
        [sellerPredecessorId, userId, sellerFamilyId, randomBytes(32), sellerScopeId],
      );
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
           issued_at, expires_at, mfa_completed_at, issued_session_epoch,
           actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'MFA',
           transaction_timestamp() - interval '30 minutes',
           transaction_timestamp() + interval '1 day',
           transaction_timestamp() - interval '2 hours', 1,
           'seller_user', 'SELLER', $6)`,
        [randomUUID(), userId, sellerFamilyId, randomBytes(32), sellerPredecessorId, sellerScopeId],
      );

      await client.query(
        `INSERT INTO identity.roles
          (id, code, actor_type, assignment_scope_type, description)
         VALUES ($1, 'FOUNDATION_SCOPE_TEST', 'customer', 'GLOBAL',
           'Synthetic constraint test role')`,
        [globalRoleId],
      );
      await expectConstraintViolation(
        client,
        `INSERT INTO identity.user_role_assignments
          (id, user_id, role_id, actor_type, scope_type, scope_id, granted_reason)
         VALUES ($1, $2, $3, 'staff', 'GLOBAL', NULL, 'Synthetic constraint test')`,
        [randomUUID(), userId, globalRoleId],
        'user_role_assignment_role_scope_actor_fk',
      );

      await client.query(
        `INSERT INTO platform.outbox_events
          (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
           aggregate_version, payload, actor_type, actor_id, correlation_id)
         VALUES ($1, 'identity.session_revoked', 1, 'atlas-database-test', 'session_family',
           $2, 1, $3::jsonb, 'customer', $4, $5)`,
        [
          randomUUID(),
          familyId,
          JSON.stringify({ userId, sessionId: familyId, revocationReason: 'USER_REQUEST' }),
          userId,
          randomUUID(),
        ],
      );
      await expectConstraintViolation(
        client,
        `INSERT INTO platform.outbox_events
          (event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
           aggregate_version, payload, actor_type, actor_id, correlation_id)
         VALUES ($1, 'identity.session_revoked.v1', 1, 'atlas-database-test', 'session_family',
           $2, 1, '{}'::jsonb, 'customer', $3, $4)`,
        [randomUUID(), randomUUID(), otherUserId, randomUUID()],
        'outbox_events_event_type_check',
      );

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  });

  it('requires rooted and directly inherited MFA evidence across refresh generations', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      const userId = randomUUID();
      const familyId = randomUUID();
      const rootSessionId = randomUUID();
      const childSessionId = randomUUID();
      const createdAt = new Date(Date.now() - 60 * 60_000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

      await client.query(
        `INSERT INTO identity.users (id, status, session_epoch)
         VALUES ($1, 'ACTIVE', 1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO identity.session_families (
           id, user_id, issued_session_epoch, actor_type, scope_type, scope_id,
           created_at, expires_at
         ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL, $3, $4)`,
        [familyId, userId, createdAt, expiresAt],
      );

      await expectStatementConstraintViolation(
        client,
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, mfa_completed_at,
           issued_at, expires_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'MFA', $5, $6, $7, 1,
           'customer', 'GLOBAL', NULL)`,
        [
          randomUUID(),
          userId,
          familyId,
          randomBytes(32),
          new Date(createdAt.getTime() - 1),
          createdAt,
          expiresAt,
        ],
        'sessions_mfa_provenance_check',
      );

      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, mfa_completed_at,
           issued_at, expires_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'MFA', $5, $5, $6, 1,
           'customer', 'GLOBAL', NULL)`,
        [rootSessionId, userId, familyId, randomBytes(32), createdAt, expiresAt],
      );

      await client.query('BEGIN');
      await client.query(
        `UPDATE identity.sessions
         SET rotated_at = transaction_timestamp()
         WHERE id = $1`,
        [rootSessionId],
      );
      await assert.rejects(
        client.query(
          `INSERT INTO identity.sessions (
             id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
             mfa_completed_at, issued_at, expires_at, issued_session_epoch,
             actor_type, scope_type, scope_id
           ) VALUES ($1, $2, $3, $4, $5, 'MFA', $6, transaction_timestamp(), $7, 1,
             'customer', 'GLOBAL', NULL)`,
          [
            randomUUID(),
            userId,
            familyId,
            randomBytes(32),
            rootSessionId,
            new Date(createdAt.getTime() + 1),
            expiresAt,
          ],
        ),
        (error: unknown) =>
          (error as { readonly constraint?: string }).constraint ===
          'sessions_rotation_parent_check',
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query(
        `UPDATE identity.sessions
         SET rotated_at = transaction_timestamp()
         WHERE id = $1`,
        [rootSessionId],
      );
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
           mfa_completed_at, issued_at, expires_at, issued_session_epoch,
           actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'MFA', $6, transaction_timestamp(), $7, 1,
           'customer', 'GLOBAL', NULL)`,
        [childSessionId, userId, familyId, randomBytes(32), rootSessionId, createdAt, expiresAt],
      );
      await client.query('COMMIT');

      const inherited = await client.query<{
        assurance_level: string;
        mfa_completed_at: Date | null;
      }>(
        `SELECT assurance_level, mfa_completed_at
         FROM identity.sessions
         WHERE id = $1`,
        [childSessionId],
      );
      assert.equal(inherited.rows[0]?.assurance_level, 'MFA');
      assert.equal(inherited.rows[0]?.mfa_completed_at?.toISOString(), createdAt.toISOString());
    } finally {
      await client.end();
    }
  });

  it('protects refresh lineage and propagates predecessor replay to the whole family', async () => {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      const userId = randomUUID();
      const familyId = randomUUID();
      const rootSessionId = randomUUID();
      const childSessionId = randomUUID();
      const originalHash = randomBytes(32);
      const createdAt = new Date(Date.now() - 60 * 60_000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

      await client.query(
        `INSERT INTO identity.users (id, status, session_epoch)
         VALUES ($1, 'ACTIVE', 1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO identity.session_families (
           id, user_id, issued_session_epoch, actor_type, scope_type, scope_id,
           created_at, expires_at
         ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL, $3, $4)`,
        [familyId, userId, createdAt, expiresAt],
      );
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'PRIMARY', $5, $6, 1, 'customer', 'GLOBAL', NULL)`,
        [rootSessionId, userId, familyId, originalHash, createdAt, expiresAt],
      );

      await expectStatementConstraintViolation(
        client,
        'UPDATE identity.sessions SET token_hash = $1 WHERE id = $2',
        [randomBytes(32), rootSessionId],
        'sessions_identity_immutable',
      );
      await expectStatementConstraintViolation(
        client,
        `UPDATE identity.session_families
         SET expires_at = expires_at + interval '1 day'
         WHERE id = $1`,
        [familyId],
        'session_families_identity_immutable',
      );
      await expectStatementConstraintViolation(
        client,
        `UPDATE identity.sessions
         SET rotated_at = transaction_timestamp(),
           reuse_detected_at = transaction_timestamp()
         WHERE id = $1`,
        [rootSessionId],
        'sessions_reuse_committed_rotation_check',
      );

      const abandonedRotationTime = new Date(Date.now() - 20_000);
      await client.query('BEGIN');
      await client.query('UPDATE identity.sessions SET rotated_at = $1 WHERE id = $2', [
        abandonedRotationTime,
        rootSessionId,
      ]);
      await assert.rejects(
        client.query('COMMIT'),
        (error: unknown) =>
          (error as { readonly constraint?: string }).constraint ===
          'sessions_active_family_topology_check',
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const rotation = await client.query<{ rotated_at: Date }>(
        `UPDATE identity.sessions
         SET rotated_at = transaction_timestamp()
         WHERE id = $1
         RETURNING rotated_at`,
        [rootSessionId],
      );
      const rotationTime = rotation.rows[0]?.rotated_at;
      assert.ok(rotationTime instanceof Date);
      await client.query(
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
           issued_at, expires_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', transaction_timestamp(), $6, 1,
           'customer', 'GLOBAL', NULL)`,
        [childSessionId, userId, familyId, randomBytes(32), rootSessionId, expiresAt],
      );
      await client.query('COMMIT');

      const preserved = await client.query<{ token_hash: Buffer }>(
        'SELECT token_hash FROM identity.sessions WHERE id = $1',
        [rootSessionId],
      );
      assert.deepEqual(preserved.rows[0]?.token_hash, originalHash);

      await expectStatementConstraintViolation(
        client,
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
           issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, 'PRIMARY', $5, $6, 1,
           'customer', 'GLOBAL', NULL)`,
        [randomUUID(), userId, familyId, randomBytes(32), rotationTime, expiresAt],
        'sessions_single_root_check',
      );
      await expectStatementConstraintViolation(
        client,
        `UPDATE identity.sessions
         SET reuse_detected_at = $1, revoked_at = $1,
           revoked_reason = 'REFRESH_TOKEN_REUSE_DETECTED'
         WHERE id = $2`,
        [new Date(rotationTime.getTime() - 1), rootSessionId],
        'sessions_reuse_state_time_check',
      );
      await expectStatementConstraintViolation(
        client,
        `UPDATE identity.session_families
         SET revoked_at = $1, revoked_reason = 'REFRESH_TOKEN_REUSE_DETECTED',
           reuse_detected_at = $1
         WHERE id = $2`,
        [new Date(), familyId],
        'session_families_reuse_evidence_check',
      );

      const reuse = await client.query<{
        reuse_detected_at: Date;
        revoked_at: Date;
        revoked_reason: string;
      }>(
        `UPDATE identity.sessions
         SET reuse_detected_at = transaction_timestamp(),
           revoked_at = transaction_timestamp() - interval '1 minute',
           revoked_reason = 'CALLER_SUPPLIED_REASON'
         WHERE id = $1
         RETURNING reuse_detected_at, revoked_at, revoked_reason`,
        [rootSessionId],
      );
      const reuseDetectedAt = reuse.rows[0]?.reuse_detected_at;
      assert.ok(reuseDetectedAt instanceof Date);
      assert.equal(reuse.rows[0]?.revoked_at.toISOString(), reuseDetectedAt.toISOString());
      assert.equal(reuse.rows[0]?.revoked_reason, 'REFRESH_TOKEN_REUSE_DETECTED');

      const compromised = await client.query<{
        family_reuse_detected_at: Date | null;
        family_revoked_at: Date | null;
        child_revoked_at: Date | null;
      }>(
        `SELECT
           family.reuse_detected_at AS family_reuse_detected_at,
           family.revoked_at AS family_revoked_at,
           child.revoked_at AS child_revoked_at
         FROM identity.session_families AS family
         INNER JOIN identity.sessions AS child ON child.id = $1
         WHERE family.id = $2`,
        [childSessionId, familyId],
      );
      assert.equal(
        compromised.rows[0]?.family_reuse_detected_at?.toISOString(),
        reuseDetectedAt.toISOString(),
      );
      assert.equal(
        compromised.rows[0]?.family_revoked_at?.toISOString(),
        reuseDetectedAt.toISOString(),
      );
      assert.equal(
        compromised.rows[0]?.child_revoked_at?.toISOString(),
        reuseDetectedAt.toISOString(),
      );

      await expectStatementConstraintViolation(
        client,
        `UPDATE identity.sessions
         SET revoked_reason = 'REWRITTEN_REASON'
         WHERE id = $1`,
        [rootSessionId],
        'sessions_lifecycle_immutable',
      );
      await expectStatementConstraintViolation(
        client,
        'DELETE FROM identity.sessions WHERE id = $1',
        [rootSessionId],
        'identity_session_lifecycle_delete_prohibited',
      );
      await expectStatementConstraintViolation(
        client,
        'DELETE FROM identity.session_families WHERE id = $1',
        [familyId],
        'identity_session_lifecycle_delete_prohibited',
      );
      await expectStatementConstraintViolation(
        client,
        `INSERT INTO identity.sessions (
           id, user_id, family_id, token_hash, rotated_from_id, assurance_level,
           issued_at, expires_at, issued_session_epoch, actor_type, scope_type, scope_id
         ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', $6, $7, 1,
           'customer', 'GLOBAL', NULL)`,
        [randomUUID(), userId, familyId, randomBytes(32), childSessionId, new Date(), expiresAt],
        'sessions_family_active_check',
      );
    } finally {
      await client.end();
    }
  });
});
