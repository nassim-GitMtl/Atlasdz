import { Client } from 'pg';

const requiredRelations = [
  'identity.users',
  'identity.roles',
  'identity.permissions',
  'identity.role_permissions',
  'identity.user_role_assignments',
  'identity.session_families',
  'identity.sessions',
  'platform.feature_flag_versions',
  'platform.audit_events',
  'platform.outbox_events',
  'platform.inbox_messages',
  'locations.dataset_versions',
  'locations.wilayas',
  'locations.communes',
] as const;

const requiredColumns = [
  ['identity', 'sessions', 'issued_session_epoch'],
  ['identity', 'sessions', 'actor_type'],
  ['identity', 'sessions', 'scope_type'],
  ['identity', 'sessions', 'scope_id'],
  ['identity', 'roles', 'actor_type'],
  ['identity', 'user_role_assignments', 'actor_type'],
  ['identity', 'session_families', 'actor_type'],
  ['platform', 'outbox_events', 'actor_type'],
] as const;

const requiredConstraints = [
  ['identity', 'sessions', 'sessions_scope_shape_check', 'c'],
  ['identity', 'sessions', 'sessions_actor_scope_check', 'c'],
  ['identity', 'sessions', 'sessions_assurance_check', 'c'],
  ['identity', 'sessions', 'sessions_privileged_mfa_check', 'c'],
  ['identity', 'sessions', 'sessions_reuse_revocation_check', 'c'],
  ['identity', 'sessions', 'sessions_mfa_evidence_time_check', 'c'],
  ['identity', 'sessions', 'sessions_no_self_rotation_check', 'c'],
  ['identity', 'sessions', 'sessions_reuse_state_time_check', 'c'],
  ['identity', 'sessions', 'sessions_family_owner_fk', 'f'],
  ['identity', 'sessions', 'sessions_rotation_family_owner_fk', 'f'],
  ['identity', 'roles', 'roles_actor_scope_check', 'c'],
  ['identity', 'user_role_assignments', 'user_role_assignment_role_scope_actor_fk', 'f'],
  ['identity', 'session_families', 'session_families_actor_scope_check', 'c'],
  ['identity', 'session_families', 'session_families_revocation_check', 'c'],
  ['platform', 'outbox_events', 'outbox_events_event_type_check', 'c'],
] as const;

// pg_trigger.tgtype is a bit mask: ROW = 1, BEFORE = 2, INSERT = 4,
// DELETE = 8, UPDATE = 16. The expected values below make trigger timing and
// events part of the live-schema contract instead of checking names alone.
const requiredTriggers = [
  {
    schema: 'identity',
    table: 'sessions',
    name: 'sessions_canonicalize_reuse_transition',
    functionSchema: 'identity',
    functionName: 'canonicalize_session_reuse_transition',
    type: 19,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: ['reuse_detected_at'],
  },
  {
    schema: 'identity',
    table: 'sessions',
    name: 'sessions_enforce_family_binding',
    functionSchema: 'identity',
    functionName: 'enforce_session_family_binding',
    type: 23,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: [],
  },
  {
    schema: 'identity',
    table: 'sessions',
    name: 'sessions_propagate_reuse_to_family',
    functionSchema: 'identity',
    functionName: 'propagate_session_reuse_to_family',
    type: 17,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: ['reuse_detected_at'],
  },
  {
    schema: 'identity',
    table: 'sessions',
    name: 'sessions_validate_active_family_topology',
    functionSchema: 'identity',
    functionName: 'enforce_active_session_family_topology',
    type: 21,
    constraint: true,
    deferrable: true,
    initiallyDeferred: true,
    updateColumns: [],
  },
  {
    schema: 'identity',
    table: 'sessions',
    name: 'sessions_reject_delete',
    functionSchema: 'identity',
    functionName: 'reject_session_lifecycle_delete',
    type: 11,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: [],
  },
  {
    schema: 'identity',
    table: 'session_families',
    name: 'session_families_protect_state',
    functionSchema: 'identity',
    functionName: 'protect_session_family_state',
    type: 19,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: [],
  },
  {
    schema: 'identity',
    table: 'session_families',
    name: 'session_families_reject_delete',
    functionSchema: 'identity',
    functionName: 'reject_session_lifecycle_delete',
    type: 11,
    constraint: false,
    deferrable: false,
    initiallyDeferred: false,
    updateColumns: [],
  },
] as const;

const requiredWallClockFunctions = [
  {
    schema: 'identity',
    name: 'enforce_session_family_binding',
    wallClockOccurrences: 5,
  },
  {
    schema: 'identity',
    name: 'enforce_active_session_family_topology',
    wallClockOccurrences: 1,
  },
] as const;

const normalizedSql = (value: string): string =>
  value.replaceAll(/[()]/g, '').replaceAll(/\s+/g, ' ').trim().toLowerCase();

export async function verifyFoundation(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, application_name: 'atlas-db-verify' });
  await client.connect();
  try {
    for (const relation of requiredRelations) {
      const result = await client.query<{ relation: string | null }>(
        'SELECT to_regclass($1)::text AS relation',
        [relation],
      );
      if (result.rows[0]?.relation !== relation) {
        throw new Error(`Required relation is missing: ${relation}`);
      }
    }

    for (const [schema, table, column] of requiredColumns) {
      const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
         ) AS exists`,
        [schema, table, column],
      );
      if (result.rows[0]?.exists !== true) {
        throw new Error(`Required column is missing: ${schema}.${table}.${column}`);
      }
    }

    for (const [schema, table, constraintName, constraintType] of requiredConstraints) {
      const result = await client.query<{
        constraint_type: string;
        validated: boolean;
      }>(
        `SELECT
           constraint_record.contype::text AS constraint_type,
           constraint_record.convalidated AS validated
         FROM pg_constraint AS constraint_record
         INNER JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND constraint_record.conname = $3`,
        [schema, table, constraintName],
      );
      const constraint = result.rows[0];
      if (
        result.rowCount !== 1 ||
        constraint?.constraint_type !== constraintType ||
        constraint.validated !== true
      ) {
        throw new Error(`Required constraint is invalid: ${schema}.${table}.${constraintName}`);
      }
    }

    const currentSessionIndex = await client.query<{
      unique_index: boolean;
      valid: boolean;
      ready: boolean;
      table_schema: string;
      table_name: string;
      key_columns: string[];
      predicate: string | null;
    }>(`
      SELECT
        index_record.indisunique AS unique_index,
        index_record.indisvalid AS valid,
        index_record.indisready AS ready,
        table_namespace.nspname AS table_schema,
        table_relation.relname AS table_name,
        ARRAY(
          SELECT pg_get_indexdef(index_record.indexrelid, position, true)
          FROM generate_series(1, index_record.indnkeyatts) AS position
          ORDER BY position
        ) AS key_columns,
        pg_get_expr(index_record.indpred, index_record.indrelid, true) AS predicate
      FROM pg_index AS index_record
      INNER JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
      INNER JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
      INNER JOIN pg_class AS table_relation ON table_relation.oid = index_record.indrelid
      INNER JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
      WHERE index_namespace.nspname = 'identity'
        AND index_relation.relname = 'sessions_one_current_generation_idx'
    `);
    const index = currentSessionIndex.rows[0];
    if (
      currentSessionIndex.rowCount !== 1 ||
      index?.unique_index !== true ||
      index.valid !== true ||
      index.ready !== true ||
      index.table_schema !== 'identity' ||
      index.table_name !== 'sessions' ||
      index.key_columns.join(',') !== 'user_id,family_id' ||
      index.predicate === null ||
      normalizedSql(index.predicate) !== 'rotated_at is null and revoked_at is null'
    ) {
      throw new Error('Required current-session uniqueness index is invalid');
    }

    for (const trigger of requiredTriggers) {
      const result = await client.query<{
        enabled: string;
        type: number;
        constraint_trigger: boolean;
        deferrable: boolean;
        initially_deferred: boolean;
        function_schema: string;
        function_name: string;
        update_columns: string[];
      }>(
        `SELECT
           trigger_record.tgenabled AS enabled,
           trigger_record.tgtype::integer AS type,
           trigger_record.tgconstraint <> 0 AS constraint_trigger,
           trigger_record.tgdeferrable AS deferrable,
           trigger_record.tginitdeferred AS initially_deferred,
           function_namespace.nspname AS function_schema,
           function_record.proname AS function_name,
           ARRAY(
             SELECT attribute.attname::text
             FROM unnest(trigger_record.tgattr::smallint[]) WITH ORDINALITY
               AS listed_attribute(attnum, position)
             INNER JOIN pg_attribute AS attribute
               ON attribute.attrelid = relation.oid
              AND attribute.attnum = listed_attribute.attnum
             ORDER BY listed_attribute.position
           ) AS update_columns
         FROM pg_trigger AS trigger_record
         INNER JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         INNER JOIN pg_proc AS function_record ON function_record.oid = trigger_record.tgfoid
         INNER JOIN pg_namespace AS function_namespace
           ON function_namespace.oid = function_record.pronamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND trigger_record.tgname = $3
           AND NOT trigger_record.tgisinternal`,
        [trigger.schema, trigger.table, trigger.name],
      );
      const liveTrigger = result.rows[0];
      if (
        result.rowCount !== 1 ||
        liveTrigger?.enabled !== 'O' ||
        liveTrigger.type !== trigger.type ||
        liveTrigger.constraint_trigger !== trigger.constraint ||
        liveTrigger.deferrable !== trigger.deferrable ||
        liveTrigger.initially_deferred !== trigger.initiallyDeferred ||
        liveTrigger.function_schema !== trigger.functionSchema ||
        liveTrigger.function_name !== trigger.functionName ||
        liveTrigger.update_columns.join(',') !== trigger.updateColumns.join(',')
      ) {
        throw new Error(
          `Required trigger is invalid: ${trigger.schema}.${trigger.table}.${trigger.name}`,
        );
      }
    }

    for (const functionContract of requiredWallClockFunctions) {
      const result = await client.query<{ definition: string }>(
        `SELECT pg_get_functiondef(function_record.oid) AS definition
         FROM pg_proc AS function_record
         INNER JOIN pg_namespace AS namespace
           ON namespace.oid = function_record.pronamespace
         WHERE namespace.nspname = $1
           AND function_record.proname = $2
           AND function_record.pronargs = 0`,
        [functionContract.schema, functionContract.name],
      );
      const definition = result.rows[0]?.definition;
      const wallClockOccurrences =
        definition === undefined ? 0 : definition.split('clock_timestamp()').length - 1;
      if (
        result.rowCount !== 1 ||
        definition === undefined ||
        definition.includes('transaction_timestamp()') ||
        wallClockOccurrences !== functionContract.wallClockOccurrences
      ) {
        throw new Error(
          `Required wall-clock function is invalid: ${functionContract.schema}.${functionContract.name}`,
        );
      }
    }

    const unsafeFlags = await client.query<{ flag_key: string }>(`
      SELECT flag_key
      FROM platform.feature_flag_versions
      WHERE is_current
        AND flag_key IN ('payments.electronic', 'finance.real_payouts')
        AND default_value <> 'false'::jsonb
    `);
    if (unsafeFlags.rowCount !== 0) {
      throw new Error('External-gated financial features are not fail-safe disabled');
    }
  } finally {
    await client.end();
  }
}

export async function seedSyntheticData(databaseUrl: string, environment: string): Promise<void> {
  if (!['local', 'test'].includes(environment)) {
    throw new Error('Synthetic seed is restricted to LOCAL and TEST environments');
  }

  const client = new Client({ connectionString: databaseUrl, application_name: 'atlas-seed' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO identity.users (id, status, preferred_locale)
      VALUES ('00000000-0000-4000-8000-000000000101', 'ACTIVE', 'fr')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO identity.roles (
        id, code, actor_type, assignment_scope_type, status, is_system, description
      )
      VALUES (
        '00000000-0000-4000-8000-000000000201',
        'LOCAL_TEST_OPERATOR',
        'staff',
        'GLOBAL',
        'ACTIVE',
        false,
        'Synthetic local/test role; never a production authorization definition'
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO identity.user_role_assignments (
        id, user_id, role_id, actor_type, scope_type, scope_id, granted_reason
      ) VALUES (
        '00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000201',
        'staff',
        'GLOBAL',
        NULL,
        'Deterministic synthetic foundation seed'
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
