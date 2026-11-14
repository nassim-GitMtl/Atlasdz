import type {
  ActorType,
  AssuranceLevel,
  AuthorizationScope,
  SessionFamilyRecord,
  SessionPersistenceContext,
  SessionRevocationCounts,
  SessionSelfServicePort,
} from '@atlas/identity';

import { IdentityDataIntegrityError } from './data-integrity-error.js';
import type { PgTransactionClient, PgTransactionPool } from './postgres-types.js';
import { isUuid, parseSessionFamilyRow, requiredRecord, requiredUuid } from './row-parsers.js';

const ACTOR_TYPES = new Set<ActorType>(['customer', 'seller_user', 'staff', 'courier']);
const ASSURANCE_LEVELS = new Set<AssuranceLevel>(['PRIMARY', 'MFA']);
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;

const LIST_CURRENT_FAMILIES_SQL = `
SELECT
  family.id::text AS "familyId",
  current_session.device_label AS "deviceLabel",
  family.actor_type AS "actorType",
  family.scope_type AS "scopeType",
  family.scope_id::text AS "scopeId",
  current_session.assurance_level AS "assuranceLevel",
  family.created_at AS "createdAt",
  current_session.last_seen_at AS "lastSeenAt",
  family.expires_at AS "expiresAt"
FROM identity.session_families AS family
INNER JOIN LATERAL (
  SELECT
    session.device_label,
    session.assurance_level,
    session.last_seen_at,
    session.issued_at,
    session.id
  FROM identity.sessions AS session
  WHERE session.user_id = family.user_id
    AND session.family_id = family.id
    AND session.rotated_at IS NULL
    AND session.revoked_at IS NULL
    AND session.reuse_detected_at IS NULL
    AND session.issued_at <= transaction_timestamp()
    AND session.expires_at > transaction_timestamp()
  ORDER BY session.issued_at DESC, session.id
  LIMIT 1
) AS current_session ON true
WHERE family.user_id = $1::uuid
  AND family.revoked_at IS NULL
  AND family.reuse_detected_at IS NULL
  AND family.created_at <= transaction_timestamp()
  AND family.expires_at > transaction_timestamp()
ORDER BY COALESCE(current_session.last_seen_at, current_session.issued_at) DESC,
  family.id
`;

const LOCK_OWNER_SQL = `
SELECT id::text AS "id"
FROM identity.users
WHERE id = $1::uuid
FOR UPDATE
`;

const LOCK_OWNED_FAMILY_SQL = `
SELECT id::text AS "id"
FROM identity.session_families
WHERE user_id = $1::uuid
  AND id = $2::uuid
FOR UPDATE
`;

const LOCK_ALL_OWNED_FAMILIES_SQL = `
SELECT id::text AS "id"
FROM identity.session_families
WHERE user_id = $1::uuid
ORDER BY id
FOR UPDATE
`;

const mutationSql = (familyPredicate: string): string => `
WITH operation AS MATERIALIZED (
  -- Locks are already held. A refresh may have committed after this transaction began.
  SELECT clock_timestamp() AS occurred_at
), revoked_families AS (
  UPDATE identity.session_families AS family
  SET
    revoked_at = operation.occurred_at,
    revoked_reason = $10
  FROM operation
  WHERE user_id = $1::uuid
    AND ${familyPredicate}
    AND revoked_at IS NULL
    AND reuse_detected_at IS NULL
    AND created_at <= operation.occurred_at
    AND expires_at > operation.occurred_at
  RETURNING id, user_id, revoked_at, row_version
),
revoked_sessions AS (
  UPDATE identity.sessions AS session
  SET
    revoked_at = family.revoked_at,
    revoked_reason = $10
  FROM revoked_families AS family
  WHERE session.user_id = family.user_id
    AND session.family_id = family.id
    AND session.revoked_at IS NULL
  RETURNING session.id, session.family_id
),
audit_insert AS (
  INSERT INTO platform.audit_events (
    event_id,
    occurred_at,
    actor_type,
    actor_id,
    session_id,
    effective_roles,
    scope_snapshot,
    action,
    outcome,
    entity_type,
    entity_id,
    entity_version,
    reason,
    correlation_id,
    after_data,
    metadata
  )
  SELECT
    gen_random_uuid(),
    family.revoked_at,
    $2,
    $3::uuid,
    $4::uuid,
    $5::text[],
    $6::jsonb,
    'identity.session_revoked',
    'SUCCEEDED',
    'session_family',
    family.id,
    family.row_version,
    $10,
    $7,
    jsonb_build_object('status', 'REVOKED', 'reason', $10),
    jsonb_build_object(
      'source', 'session_self_service',
      'assuranceLevel', $9::text
    )
  FROM revoked_families AS family
  RETURNING entity_id
),
outbox_insert AS (
  INSERT INTO platform.outbox_events (
    event_id,
    event_type,
    event_version,
    producer,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    payload,
    actor_type,
    actor_id,
    correlation_id,
    occurred_at
  )
  SELECT
    gen_random_uuid(),
    'identity.session_revoked',
    1,
    'atlas-api',
    'session_family',
    family.id,
    family.row_version,
    jsonb_build_object(
      'userId', family.user_id,
      'sessionId', family.id,
      'revocationReason', $10
    ),
    $2,
    $3::uuid,
    $7,
    family.revoked_at
  FROM revoked_families AS family
  RETURNING aggregate_id
)
SELECT
  family.id::text AS "familyId",
  count(session.id)::text AS "sessionCount"
FROM revoked_families AS family
LEFT JOIN revoked_sessions AS session ON session.family_id = family.id
INNER JOIN audit_insert ON audit_insert.entity_id = family.id
INNER JOIN outbox_insert ON outbox_insert.aggregate_id = family.id
GROUP BY family.id
ORDER BY family.id
`;

const REVOKE_OWNED_FAMILY_SQL = mutationSql('family.id = $8::uuid');
const REVOKE_OTHER_FAMILIES_SQL = mutationSql('family.id <> $8::uuid');

const sessionCounts = (rows: readonly unknown[]): SessionRevocationCounts => {
  let revokedSessionCount = 0;
  for (const row of rows) {
    const record = requiredRecord(row, 'revokedFamily');
    requiredUuid(record, 'familyId');
    const rawCount = record['sessionCount'];
    const count = typeof rawCount === 'string' ? Number(rawCount) : rawCount;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new IdentityDataIntegrityError('Invalid revoked session count');
    }
    revokedSessionCount += count;
  }
  return Object.freeze({
    revokedFamilyCount: rows.length,
    revokedSessionCount,
  });
};

const validScope = (scope: AuthorizationScope): boolean =>
  scope.type === 'GLOBAL' ? !('id' in scope) : isUuid(scope.id);

const assertContext = (context: SessionPersistenceContext): void => {
  if (
    !isUuid(context.ownerUserId) ||
    !isUuid(context.actor.id) ||
    context.actor.id !== context.ownerUserId ||
    !isUuid(context.actor.sessionId) ||
    !isUuid(context.currentFamilyId) ||
    !ACTOR_TYPES.has(context.actor.type) ||
    !ASSURANCE_LEVELS.has(context.actor.assuranceLevel) ||
    !validScope(context.actor.scope) ||
    (!isUuid(context.correlationId) && !ULID_PATTERN.test(context.correlationId)) ||
    context.actor.effectiveRoleCodes.length > 64 ||
    !context.actor.effectiveRoleCodes.every((code) => ROLE_CODE_PATTERN.test(code))
  ) {
    throw new TypeError('Invalid session persistence context');
  }
};

const mutationValues = (
  context: SessionPersistenceContext,
  familyId: string,
  reason: 'USER_REQUESTED' | 'OTHER_SESSIONS_REVOKED',
): unknown[] => [
  context.ownerUserId,
  context.actor.type,
  context.actor.id,
  context.actor.sessionId,
  [...context.actor.effectiveRoleCodes],
  JSON.stringify(context.actor.scope),
  context.correlationId,
  familyId,
  context.actor.assuranceLevel,
  reason,
];

const rollback = async (client: PgTransactionClient, cause: unknown): Promise<never> => {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError: unknown) {
    throw new AggregateError(
      [cause, rollbackError],
      'Identity transaction failed and rollback was unsuccessful',
      { cause: rollbackError },
    );
  }
  throw cause;
};

export class PostgresSessionRepository implements SessionSelfServicePort {
  public constructor(private readonly database: PgTransactionPool) {}

  public async listCurrentFamilies(
    context: SessionPersistenceContext,
  ): Promise<readonly SessionFamilyRecord[]> {
    assertContext(context);
    const result = await this.database.query(LIST_CURRENT_FAMILIES_SQL, [context.ownerUserId]);
    return Object.freeze(result.rows.map(parseSessionFamilyRow));
  }

  public async revokeOwnedFamilyAtomically(
    context: SessionPersistenceContext,
    targetFamilyId: string,
  ): Promise<
    Readonly<{ found: false }> | Readonly<{ found: true; counts: SessionRevocationCounts }>
  > {
    assertContext(context);
    if (!isUuid(targetFamilyId)) {
      return Object.freeze({ found: false });
    }

    return this.inTransaction(async (client) => {
      await this.lockOwner(client, context.ownerUserId);
      const owned = await client.query(LOCK_OWNED_FAMILY_SQL, [
        context.ownerUserId,
        targetFamilyId,
      ]);
      if (owned.rows.length === 0) {
        return Object.freeze({ found: false as const });
      }

      const revoked = await client.query(
        REVOKE_OWNED_FAMILY_SQL,
        mutationValues(context, targetFamilyId, 'USER_REQUESTED'),
      );
      return Object.freeze({ found: true as const, counts: sessionCounts(revoked.rows) });
    });
  }

  public async revokeOtherFamiliesAtomically(
    context: SessionPersistenceContext,
  ): Promise<SessionRevocationCounts> {
    assertContext(context);
    return this.inTransaction(async (client) => {
      await this.lockOwner(client, context.ownerUserId);
      await client.query(LOCK_ALL_OWNED_FAMILIES_SQL, [context.ownerUserId]);
      const revoked = await client.query(
        REVOKE_OTHER_FAMILIES_SQL,
        mutationValues(context, context.currentFamilyId, 'OTHER_SESSIONS_REVOKED'),
      );
      return sessionCounts(revoked.rows);
    });
  }

  private async lockOwner(client: PgTransactionClient, ownerUserId: string): Promise<void> {
    const owner = await client.query(LOCK_OWNER_SQL, [ownerUserId]);
    if (owner.rows.length !== 1) {
      throw new IdentityDataIntegrityError('Resolved session owner no longer exists');
    }
  }

  private async inTransaction<T>(work: (client: PgTransactionClient) => Promise<T>): Promise<T> {
    const client = await this.database.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await work(client);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error: unknown) {
      if (transactionStarted) {
        return rollback(client, error);
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
