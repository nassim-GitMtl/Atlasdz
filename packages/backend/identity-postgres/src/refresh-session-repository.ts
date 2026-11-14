import type {
  RefreshSessionRepositoryPort,
  RefreshSessionRotationCommand,
  RefreshSessionRotationResult,
} from '@atlas/identity';

import { IdentityDataIntegrityError } from './data-integrity-error.js';
import type { PgTransactionClient, PgTransactionPool } from './postgres-types.js';
import {
  isUuid,
  parseRotatedSessionBindingRow,
  requiredRecord,
  requiredUuid,
} from './row-parsers.js';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TOKEN_DIGEST_LENGTH = 32;

const LOCATE_GENERATION_SQL = `
SELECT
  session.id::text AS "sessionId",
  session.user_id::text AS "userId",
  session.family_id::text AS "familyId"
FROM identity.sessions AS session
WHERE session.token_hash = $1::bytea
`;

const LOCK_USER_SQL = `
SELECT id::text AS "id"
FROM identity.users
WHERE id = $1::uuid
FOR UPDATE
`;

const LOCK_FAMILY_SQL = `
SELECT id::text AS "id"
FROM identity.session_families
WHERE id = $1::uuid AND user_id = $2::uuid
FOR UPDATE
`;

const LOCK_AND_CLASSIFY_GENERATION_SQL = `
SELECT
  session.reuse_detected_at IS NOT NULL AS "generationReuseRecorded",
  family.reuse_detected_at IS NOT NULL AS "familyReuseRecorded",
  session.rotated_at IS NOT NULL AS "generationRotated",
  session.revoked_at IS NOT NULL AS "generationRevoked",
  family.revoked_at IS NOT NULL AS "familyRevoked",
  (
    identity_user.status = 'ACTIVE'
    AND identity_user.session_epoch = family.issued_session_epoch
    AND identity_user.session_epoch = session.issued_session_epoch
    AND family.actor_type = session.actor_type
    AND family.scope_type = session.scope_type
    AND family.scope_id IS NOT DISTINCT FROM session.scope_id
    AND family.revoked_at IS NULL
    AND family.reuse_detected_at IS NULL
    AND family.created_at <= clock_timestamp()
    AND family.expires_at > clock_timestamp()
    AND session.rotated_at IS NULL
    AND session.revoked_at IS NULL
    AND session.reuse_detected_at IS NULL
    AND session.issued_at <= clock_timestamp()
    AND session.expires_at > clock_timestamp()
  ) AS "canRotate"
FROM identity.sessions AS session
INNER JOIN identity.session_families AS family
  ON family.id = session.family_id AND family.user_id = session.user_id
INNER JOIN identity.users AS identity_user ON identity_user.id = session.user_id
WHERE session.id = $1::uuid
  AND session.user_id = $2::uuid
  AND session.family_id = $3::uuid
  AND session.token_hash = $4::bytea
FOR UPDATE OF session
`;

const ROTATE_PARENT_SQL = `
WITH operation AS (
  SELECT clock_timestamp() AS occurred_at
)
UPDATE identity.sessions AS session
SET
  rotated_at = operation.occurred_at,
  last_seen_at = operation.occurred_at
FROM operation
WHERE session.id = $1::uuid
  AND session.user_id = $2::uuid
  AND session.family_id = $3::uuid
  AND session.token_hash = $4::bytea
  AND session.rotated_at IS NULL
  AND session.revoked_at IS NULL
  AND session.reuse_detected_at IS NULL
  AND session.expires_at > operation.occurred_at
RETURNING session.rotated_at
`;

const INSERT_SUCCESSOR_SQL = `
INSERT INTO identity.sessions (
  id,
  user_id,
  family_id,
  token_hash,
  rotated_from_id,
  device_label,
  device_hash,
  assurance_level,
  issued_at,
  expires_at,
  last_seen_at,
  mfa_completed_at,
  issued_session_epoch,
  actor_type,
  scope_type,
  scope_id
)
SELECT
  $1::uuid,
  predecessor.user_id,
  predecessor.family_id,
  $2::bytea,
  predecessor.id,
  predecessor.device_label,
  predecessor.device_hash,
  predecessor.assurance_level,
  predecessor.rotated_at,
  LEAST(predecessor.expires_at, family.expires_at),
  predecessor.rotated_at,
  predecessor.mfa_completed_at,
  predecessor.issued_session_epoch,
  predecessor.actor_type,
  predecessor.scope_type,
  predecessor.scope_id
FROM identity.sessions AS predecessor
INNER JOIN identity.session_families AS family
  ON family.id = predecessor.family_id AND family.user_id = predecessor.user_id
WHERE predecessor.id = $3::uuid
  AND predecessor.user_id = $4::uuid
  AND predecessor.family_id = $5::uuid
  AND predecessor.rotated_at IS NOT NULL
  AND predecessor.revoked_at IS NULL
  AND predecessor.reuse_detected_at IS NULL
  AND family.revoked_at IS NULL
  AND family.reuse_detected_at IS NULL
  AND family.expires_at > clock_timestamp()
RETURNING
  id::text AS "sessionId",
  family_id::text AS "familyId",
  user_id::text AS "userId",
  issued_session_epoch::text AS "sessionEpoch",
  actor_type AS "actorType",
  scope_type AS "scopeType",
  scope_id::text AS "scopeId",
  assurance_level AS "assuranceLevel",
  mfa_completed_at AS "mfaCompletedAt",
  issued_at AS "issuedAt",
  expires_at AS "expiresAt"
`;

const BUMP_FAMILY_VERSION_SQL = `
UPDATE identity.session_families
SET row_version = row_version
WHERE id = $1::uuid AND user_id = $2::uuid
RETURNING row_version
`;

const INSERT_ROTATION_AUDIT_SQL = `
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
  successor.issued_at,
  successor.actor_type,
  successor.user_id,
  predecessor.id,
  ARRAY[]::text[],
  CASE
    WHEN successor.scope_type = 'GLOBAL'
      THEN jsonb_build_object('type', successor.scope_type)
    ELSE jsonb_build_object('type', successor.scope_type, 'id', successor.scope_id)
  END,
  'identity.session_rotated',
  'SUCCEEDED',
  'session_family',
  successor.family_id,
  family.row_version,
  'REFRESH_TOKEN_ROTATED',
  $3,
  jsonb_build_object('currentSessionId', successor.id),
  jsonb_build_object(
    'source', 'refresh_credential',
    'assuranceLevel', successor.assurance_level
  )
FROM identity.sessions AS successor
INNER JOIN identity.sessions AS predecessor ON predecessor.id = successor.rotated_from_id
INNER JOIN identity.session_families AS family
  ON family.id = successor.family_id AND family.user_id = successor.user_id
WHERE successor.id = $1::uuid AND successor.family_id = $2::uuid
RETURNING event_id
`;

const RECORD_REPLAY_SQL = `
WITH operation AS (
  SELECT clock_timestamp() AS occurred_at
)
UPDATE identity.sessions AS session
SET reuse_detected_at = operation.occurred_at
FROM operation
WHERE session.id = $1::uuid
  AND session.user_id = $2::uuid
  AND session.family_id = $3::uuid
  AND session.token_hash = $4::bytea
  AND session.rotated_at IS NOT NULL
  AND session.reuse_detected_at IS NULL
  AND operation.occurred_at >= session.rotated_at
RETURNING session.reuse_detected_at
`;

const INSERT_REPLAY_EVIDENCE_SQL = `
WITH evidence AS (
  SELECT
    session.id AS session_id,
    session.user_id,
    session.family_id,
    session.actor_type,
    session.scope_type,
    session.scope_id,
    session.assurance_level,
    session.reuse_detected_at,
    family.row_version
  FROM identity.sessions AS session
  INNER JOIN identity.session_families AS family
    ON family.id = session.family_id AND family.user_id = session.user_id
  WHERE session.id = $1::uuid
    AND session.family_id = $2::uuid
    AND session.reuse_detected_at IS NOT NULL
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
    evidence.reuse_detected_at,
    evidence.actor_type,
    evidence.user_id,
    evidence.session_id,
    ARRAY[]::text[],
    CASE
      WHEN evidence.scope_type = 'GLOBAL'
        THEN jsonb_build_object('type', evidence.scope_type)
      ELSE jsonb_build_object('type', evidence.scope_type, 'id', evidence.scope_id)
    END,
    'identity.refresh_reuse_detected',
    'DENIED',
    'session_family',
    evidence.family_id,
    evidence.row_version,
    'REFRESH_TOKEN_REUSE_DETECTED',
    $3,
    jsonb_build_object(
      'status', 'COMPROMISED',
      'reason', 'REFRESH_TOKEN_REUSE_DETECTED'
    ),
    jsonb_build_object(
      'source', 'refresh_credential',
      'credentialAttribution', 'BEARER_POSSESSION',
      'assuranceLevel', evidence.assurance_level
    )
  FROM evidence
  RETURNING entity_id
),
revocation_event AS (
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
    evidence.family_id,
    evidence.row_version,
    jsonb_build_object(
      'userId', evidence.user_id,
      'sessionId', evidence.family_id,
      'revocationReason', 'REFRESH_TOKEN_REUSE_DETECTED'
    ),
    evidence.actor_type,
    evidence.user_id,
    $3,
    evidence.reuse_detected_at
  FROM evidence
  RETURNING aggregate_id
),
suspicious_login_event AS (
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
    'identity.login_suspicious',
    1,
    'atlas-api',
    'session_family',
    evidence.family_id,
    evidence.row_version,
    jsonb_build_object(
      'userId', evidence.user_id,
      'reasonCodes', jsonb_build_array('REFRESH_TOKEN_REUSE_DETECTED'),
      'sessionId', evidence.session_id,
      'occurredAt', evidence.reuse_detected_at
    ),
    evidence.actor_type,
    evidence.user_id,
    $3,
    evidence.reuse_detected_at
  FROM evidence
  RETURNING aggregate_id
)
SELECT evidence.family_id::text AS "familyId"
FROM evidence
INNER JOIN audit_insert ON audit_insert.entity_id = evidence.family_id
INNER JOIN revocation_event ON revocation_event.aggregate_id = evidence.family_id
INNER JOIN suspicious_login_event
  ON suspicious_login_event.aggregate_id = evidence.family_id
`;

interface PreparedCommand {
  readonly presentedTokenDigest: Buffer;
  readonly successorSessionId: string;
  readonly successorTokenDigest: Buffer;
  readonly correlationId: string;
}

interface RefreshCandidate {
  readonly sessionId: string;
  readonly userId: string;
  readonly familyId: string;
}

interface LockedGenerationState {
  readonly generationReuseRecorded: boolean;
  readonly familyReuseRecorded: boolean;
  readonly generationRotated: boolean;
  readonly generationRevoked: boolean;
  readonly familyRevoked: boolean;
  readonly canRotate: boolean;
}

const requiredBoolean = (record: Readonly<Record<string, unknown>>, field: string): boolean => {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new IdentityDataIntegrityError(`Invalid identity persistence field: ${field}`);
  }
  return value;
};

const prepareCommand = (command: RefreshSessionRotationCommand): PreparedCommand => {
  if (
    !isUuid(command.successorSessionId) ||
    (!isUuid(command.correlationId) && !ULID_PATTERN.test(command.correlationId)) ||
    !(command.presentedTokenDigest instanceof Uint8Array) ||
    command.presentedTokenDigest.byteLength !== TOKEN_DIGEST_LENGTH ||
    !(command.successorTokenDigest instanceof Uint8Array) ||
    command.successorTokenDigest.byteLength !== TOKEN_DIGEST_LENGTH
  ) {
    throw new TypeError('Invalid refresh session rotation command');
  }

  const presentedTokenDigest = Buffer.from(command.presentedTokenDigest);
  const successorTokenDigest = Buffer.from(command.successorTokenDigest);
  if (presentedTokenDigest.equals(successorTokenDigest)) {
    throw new TypeError('Refresh successor digest must be distinct');
  }

  return Object.freeze({
    presentedTokenDigest,
    successorSessionId: command.successorSessionId,
    successorTokenDigest,
    correlationId: command.correlationId,
  });
};

const parseCandidate = (value: unknown): RefreshCandidate => {
  const record = requiredRecord(value, 'refreshCandidate');
  return Object.freeze({
    sessionId: requiredUuid(record, 'sessionId'),
    userId: requiredUuid(record, 'userId'),
    familyId: requiredUuid(record, 'familyId'),
  });
};

const parseLockedGenerationState = (value: unknown): LockedGenerationState => {
  const record = requiredRecord(value, 'lockedRefreshGeneration');
  return Object.freeze({
    generationReuseRecorded: requiredBoolean(record, 'generationReuseRecorded'),
    familyReuseRecorded: requiredBoolean(record, 'familyReuseRecorded'),
    generationRotated: requiredBoolean(record, 'generationRotated'),
    generationRevoked: requiredBoolean(record, 'generationRevoked'),
    familyRevoked: requiredBoolean(record, 'familyRevoked'),
    canRotate: requiredBoolean(record, 'canRotate'),
  });
};

const rollback = async (client: PgTransactionClient, cause: unknown): Promise<never> => {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError: unknown) {
    throw new AggregateError(
      [cause, rollbackError],
      'Refresh session transaction failed and rollback was unsuccessful',
      { cause: rollbackError },
    );
  }
  throw cause;
};

export class PostgresRefreshSessionRepository implements RefreshSessionRepositoryPort {
  public constructor(private readonly database: PgTransactionPool) {}

  public async rotateOrRecordReplayAtomically(
    command: RefreshSessionRotationCommand,
  ): Promise<RefreshSessionRotationResult> {
    const prepared = prepareCommand(command);
    const located = await this.database.query(LOCATE_GENERATION_SQL, [
      prepared.presentedTokenDigest,
    ]);
    if (located.rows.length === 0) {
      return Object.freeze({ kind: 'REFRESH_TOKEN_INVALID' });
    }
    if (located.rows.length !== 1) {
      throw new IdentityDataIntegrityError('Refresh digest resolved more than one generation');
    }

    const candidate = parseCandidate(located.rows[0]);
    if (candidate.sessionId === prepared.successorSessionId) {
      throw new TypeError('Refresh successor session must be distinct');
    }

    return this.inTransaction(async (client) => {
      const owner = await client.query(LOCK_USER_SQL, [candidate.userId]);
      if (owner.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh session owner no longer exists');
      }

      const family = await client.query(LOCK_FAMILY_SQL, [candidate.familyId, candidate.userId]);
      if (family.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh session family no longer exists');
      }

      const locked = await client.query(LOCK_AND_CLASSIFY_GENERATION_SQL, [
        candidate.sessionId,
        candidate.userId,
        candidate.familyId,
        prepared.presentedTokenDigest,
      ]);
      if (locked.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh generation changed during resolution');
      }
      const state = parseLockedGenerationState(locked.rows[0]);

      if (state.generationReuseRecorded || (state.generationRotated && state.familyReuseRecorded)) {
        return Object.freeze({ kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: false });
      }

      if (state.generationRotated) {
        const replay = await client.query(RECORD_REPLAY_SQL, [
          candidate.sessionId,
          candidate.userId,
          candidate.familyId,
          prepared.presentedTokenDigest,
        ]);
        if (replay.rows.length !== 1) {
          return Object.freeze({ kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: false });
        }
        const evidence = await client.query(INSERT_REPLAY_EVIDENCE_SQL, [
          candidate.sessionId,
          candidate.familyId,
          prepared.correlationId,
        ]);
        if (evidence.rows.length !== 1) {
          throw new IdentityDataIntegrityError('Refresh replay evidence was not persisted');
        }
        return Object.freeze({ kind: 'REFRESH_TOKEN_REUSED', evidenceRecorded: true });
      }

      if (state.familyReuseRecorded || state.familyRevoked || state.generationRevoked) {
        return Object.freeze({ kind: 'SESSION_REVOKED' });
      }
      if (!state.canRotate) {
        return Object.freeze({ kind: 'REFRESH_TOKEN_INVALID' });
      }

      const rotated = await client.query(ROTATE_PARENT_SQL, [
        candidate.sessionId,
        candidate.userId,
        candidate.familyId,
        prepared.presentedTokenDigest,
      ]);
      if (rotated.rows.length !== 1) {
        return Object.freeze({ kind: 'REFRESH_TOKEN_INVALID' });
      }

      const successor = await client.query(INSERT_SUCCESSOR_SQL, [
        prepared.successorSessionId,
        prepared.successorTokenDigest,
        candidate.sessionId,
        candidate.userId,
        candidate.familyId,
      ]);
      if (successor.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh successor was not persisted');
      }

      const version = await client.query(BUMP_FAMILY_VERSION_SQL, [
        candidate.familyId,
        candidate.userId,
      ]);
      if (version.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh family version was not advanced');
      }

      const audit = await client.query(INSERT_ROTATION_AUDIT_SQL, [
        prepared.successorSessionId,
        candidate.familyId,
        prepared.correlationId,
      ]);
      if (audit.rows.length !== 1) {
        throw new IdentityDataIntegrityError('Refresh rotation audit was not persisted');
      }

      return Object.freeze({
        kind: 'ROTATED',
        binding: parseRotatedSessionBindingRow(successor.rows[0]),
      });
    });
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
