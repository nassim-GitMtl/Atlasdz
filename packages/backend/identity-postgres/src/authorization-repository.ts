import type {
  IdentityAuthorizationRepositoryPort,
  IdentityAuthorizationSnapshot,
} from '@atlas/identity';

import { IdentityDataIntegrityError } from './data-integrity-error.js';
import type { PgQueryable } from './postgres-types.js';
import {
  emptyAuthorizationSnapshot,
  isUuid,
  parseAuthorizationSnapshotRow,
} from './row-parsers.js';

const AUTHORIZATION_SNAPSHOT_SQL = `
WITH selected_assignments AS (
  SELECT
    a.id,
    a.user_id,
    a.role_id,
    a.actor_type,
    a.scope_type,
    a.scope_id,
    a.valid_from,
    a.valid_until,
    a.revoked_at
  FROM identity.user_role_assignments AS a
  WHERE a.user_id = $1::uuid
),
selected_roles AS (
  SELECT DISTINCT r.id, r.code, r.actor_type, r.assignment_scope_type, r.status
  FROM identity.roles AS r
  INNER JOIN selected_assignments AS a ON a.role_id = r.id
),
selected_role_permissions AS (
  SELECT rp.id, rp.role_id, rp.permission_id, rp.granted_at, rp.valid_until, rp.revoked_at
  FROM identity.role_permissions AS rp
  INNER JOIN selected_roles AS r ON r.id = rp.role_id
),
selected_permissions AS (
  SELECT DISTINCT p.id, p.code, p.status
  FROM identity.permissions AS p
  INNER JOIN selected_role_permissions AS rp ON rp.permission_id = p.id
)
SELECT
  (
    SELECT jsonb_build_object(
      'id', u.id::text,
      'status', u.status,
      'sessionEpoch', u.session_epoch::text
    )
    FROM identity.users AS u
    WHERE u.id = $1::uuid
  ) AS "user",
  (
    SELECT jsonb_build_object(
      'id', s.id::text,
      'userId', s.user_id::text,
      'familyId', s.family_id::text,
      'sessionEpoch', s.issued_session_epoch::text,
      'actorType', s.actor_type,
      'scopeType', s.scope_type,
      'scopeId', s.scope_id::text,
      'assuranceLevel', s.assurance_level,
      'issuedAt', s.issued_at,
      'expiresAt', s.expires_at,
      'mfaCompletedAt', s.mfa_completed_at,
      'rotatedAt', s.rotated_at,
      'revokedAt', s.revoked_at,
      'reuseDetectedAt', s.reuse_detected_at
    )
    FROM identity.sessions AS s
    WHERE s.id = $2::uuid
  ) AS "session",
  (
    SELECT jsonb_build_object(
      'id', f.id::text,
      'userId', f.user_id::text,
      'sessionEpoch', f.issued_session_epoch::text,
      'actorType', f.actor_type,
      'scopeType', f.scope_type,
      'scopeId', f.scope_id::text,
      'createdAt', f.created_at,
      'expiresAt', f.expires_at,
      'revokedAt', f.revoked_at,
      'reuseDetectedAt', f.reuse_detected_at
    )
    FROM identity.session_families AS f
    INNER JOIN identity.sessions AS family_session
      ON family_session.family_id = f.id
      AND family_session.user_id = f.user_id
    WHERE family_session.id = $2::uuid
  ) AS "sessionFamily",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id::text,
      'userId', a.user_id::text,
      'roleId', a.role_id::text,
      'actorType', a.actor_type,
      'scopeType', a.scope_type,
      'scopeId', a.scope_id::text,
      'validFrom', a.valid_from,
      'validUntil', a.valid_until,
      'revokedAt', a.revoked_at
    ) ORDER BY a.id)
    FROM selected_assignments AS a
  ), '[]'::jsonb) AS "assignments",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id::text,
      'code', r.code,
      'actorType', r.actor_type,
      'assignmentScopeType', r.assignment_scope_type,
      'status', r.status
    ) ORDER BY r.id)
    FROM selected_roles AS r
  ), '[]'::jsonb) AS "roles",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', rp.id::text,
      'roleId', rp.role_id::text,
      'permissionId', rp.permission_id::text,
      'grantedAt', rp.granted_at,
      'validUntil', rp.valid_until,
      'revokedAt', rp.revoked_at
    ) ORDER BY rp.id)
    FROM selected_role_permissions AS rp
  ), '[]'::jsonb) AS "rolePermissionGrants",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id::text,
      'code', p.code,
      'status', p.status
    ) ORDER BY p.id)
    FROM selected_permissions AS p
  ), '[]'::jsonb) AS "permissions"
`;

export class PostgresIdentityAuthorizationRepository implements IdentityAuthorizationRepositoryPort {
  public constructor(private readonly database: PgQueryable) {}

  public async loadAuthorizationSnapshot(
    userId: string,
    sessionId: string,
  ): Promise<IdentityAuthorizationSnapshot> {
    // Malformed provider claims are untrusted input. Treat them as unresolved instead of
    // handing invalid UUID casts to PostgreSQL or exposing adapter errors to the caller.
    if (!isUuid(userId) || !isUuid(sessionId)) {
      return emptyAuthorizationSnapshot();
    }

    const result = await this.database.query(AUTHORIZATION_SNAPSHOT_SQL, [userId, sessionId]);
    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new IdentityDataIntegrityError(
        'Authorization snapshot query returned an invalid shape',
      );
    }
    return parseAuthorizationSnapshotRow(result.rows[0]);
  }
}
