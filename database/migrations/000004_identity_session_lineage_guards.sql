-- Close refresh-token lineage mutation and lifecycle gaps without rewriting checksum-locked
-- migrations. Session families remain the authoritative lifetime and compromise boundary.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM identity.sessions
    WHERE rotated_from_id = id
  ) THEN
    RAISE EXCEPTION
      'session lineage contains a self-reference; approved remediation is required';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT
        session.id AS origin_id,
        session.rotated_from_id AS next_id,
        ARRAY[session.id]::uuid[] AS path,
        false AS cycle
      FROM identity.sessions AS session

      UNION ALL

      SELECT
        ancestry.origin_id,
        parent.rotated_from_id,
        ancestry.path || parent.id,
        parent.id = ANY(ancestry.path)
      FROM ancestry
      INNER JOIN identity.sessions AS parent ON parent.id = ancestry.next_id
      WHERE NOT ancestry.cycle
    )
    SELECT 1 FROM ancestry WHERE cycle
  ) THEN
    RAISE EXCEPTION
      'session lineage contains a cycle; approved remediation is required';
  END IF;

  IF EXISTS (
    SELECT family_id
    FROM identity.sessions
    GROUP BY family_id
    HAVING count(*) FILTER (WHERE rotated_from_id IS NULL) <> 1
  ) THEN
    RAISE EXCEPTION
      'session family does not contain exactly one root; approved remediation is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM identity.sessions AS child
    INNER JOIN identity.sessions AS parent ON parent.id = child.rotated_from_id
    WHERE parent.rotated_at IS NULL
      OR child.issued_at IS DISTINCT FROM parent.rotated_at
      OR child.issued_at >= parent.expires_at
      OR (parent.revoked_at IS NOT NULL AND parent.revoked_at <= child.issued_at)
      OR (parent.reuse_detected_at IS NOT NULL AND parent.reuse_detected_at <= child.issued_at)
      OR ROW(child.assurance_level, child.mfa_completed_at)
        IS DISTINCT FROM ROW(parent.assurance_level, parent.mfa_completed_at)
  ) THEN
    RAISE EXCEPTION
      'session lineage contains an invalid parent transition; approved remediation is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM identity.sessions AS session
    INNER JOIN identity.session_families AS family
      ON family.id = session.family_id AND family.user_id = session.user_id
    WHERE session.rotated_from_id IS NULL
      AND session.assurance_level = 'MFA'
      AND (
        session.mfa_completed_at IS NULL
        OR session.mfa_completed_at < family.created_at
        OR session.mfa_completed_at > session.issued_at
      )
  ) THEN
    RAISE EXCEPTION
      'root session contains MFA evidence outside its family issuance window; approved remediation is required';
  END IF;
END;
$$;

ALTER TABLE identity.sessions
  ADD CONSTRAINT sessions_no_self_rotation_check CHECK (
    rotated_from_id IS NULL OR rotated_from_id <> id
  ),
  ADD CONSTRAINT sessions_reuse_state_time_check CHECK (
    reuse_detected_at IS NULL
    OR (
      rotated_at IS NOT NULL
      AND reuse_detected_at >= rotated_at
    )
  );

CREATE OR REPLACE FUNCTION identity.protect_session_family_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.user_id,
    NEW.issued_session_epoch,
    NEW.actor_type,
    NEW.scope_type,
    NEW.scope_id,
    NEW.created_at,
    NEW.expires_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.user_id,
    OLD.issued_session_epoch,
    OLD.actor_type,
    OLD.scope_type,
    OLD.scope_id,
    OLD.created_at,
    OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'session family identity and lifetime are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'session_families_identity_immutable';
  END IF;

  IF OLD.revoked_at IS NOT NULL
    AND ROW(NEW.revoked_at, NEW.revoked_reason)
      IS DISTINCT FROM ROW(OLD.revoked_at, OLD.revoked_reason)
  THEN
    RAISE EXCEPTION 'session family revocation is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'session_families_revocation_immutable';
  END IF;

  IF OLD.reuse_detected_at IS NOT NULL
    AND NEW.reuse_detected_at IS DISTINCT FROM OLD.reuse_detected_at
  THEN
    RAISE EXCEPTION 'session family reuse evidence is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'session_families_reuse_immutable';
  END IF;

  IF OLD.reuse_detected_at IS NULL AND NEW.reuse_detected_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM identity.sessions AS evidence
      WHERE evidence.user_id = NEW.user_id
        AND evidence.family_id = NEW.id
        AND evidence.reuse_detected_at = NEW.reuse_detected_at
    )
  THEN
    RAISE EXCEPTION 'session family reuse requires generation evidence'
      USING ERRCODE = '23514', CONSTRAINT = 'session_families_reuse_evidence_check';
  END IF;

  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION identity.enforce_session_family_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
DECLARE
  family identity.session_families%ROWTYPE;
  parent identity.sessions%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.id,
      NEW.user_id,
      NEW.family_id,
      NEW.token_hash,
      NEW.device_hash,
      NEW.issued_session_epoch,
      NEW.actor_type,
      NEW.scope_type,
      NEW.scope_id,
      NEW.assurance_level,
      NEW.mfa_completed_at,
      NEW.issued_at,
      NEW.expires_at,
      NEW.rotated_from_id
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.user_id,
      OLD.family_id,
      OLD.token_hash,
      OLD.device_hash,
      OLD.issued_session_epoch,
      OLD.actor_type,
      OLD.scope_type,
      OLD.scope_id,
      OLD.assurance_level,
      OLD.mfa_completed_at,
      OLD.issued_at,
      OLD.expires_at,
      OLD.rotated_from_id
    ) THEN
      RAISE EXCEPTION 'session identity, credential, assurance, and lineage are immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sessions_identity_immutable';
    END IF;

    IF (OLD.rotated_at IS NOT NULL AND NEW.rotated_at IS DISTINCT FROM OLD.rotated_at)
      OR (
        OLD.revoked_at IS NOT NULL
        AND ROW(NEW.revoked_at, NEW.revoked_reason)
          IS DISTINCT FROM ROW(OLD.revoked_at, OLD.revoked_reason)
      )
      OR (
        OLD.reuse_detected_at IS NOT NULL
        AND NEW.reuse_detected_at IS DISTINCT FROM OLD.reuse_detected_at
      )
    THEN
      RAISE EXCEPTION 'session terminal lifecycle evidence is immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sessions_lifecycle_immutable';
    END IF;

    IF OLD.rotated_at IS NULL AND NEW.rotated_at IS NOT NULL THEN
      SELECT * INTO family
      FROM identity.session_families
      WHERE id = NEW.family_id AND user_id = NEW.user_id
      FOR UPDATE;

      IF NOT FOUND
        OR family.revoked_at IS NOT NULL
        OR family.reuse_detected_at IS NOT NULL
        OR family.expires_at <= transaction_timestamp()
        OR NEW.rotated_at < NEW.issued_at
        OR NEW.rotated_at >= NEW.expires_at
        OR NEW.rotated_at > transaction_timestamp()
      THEN
        RAISE EXCEPTION 'session cannot rotate from its current state'
          USING ERRCODE = '23514', CONSTRAINT = 'sessions_rotation_state_check';
      END IF;
    END IF;

    IF OLD.reuse_detected_at IS NULL AND NEW.reuse_detected_at IS NOT NULL THEN
      IF NEW.rotated_at IS NULL
        OR NEW.reuse_detected_at < NEW.rotated_at
        OR NEW.reuse_detected_at > transaction_timestamp()
      THEN
        RAISE EXCEPTION 'session reuse evidence is outside the rotated generation window'
          USING ERRCODE = '23514', CONSTRAINT = 'sessions_reuse_state_time_check';
      END IF;

      NEW.revoked_at := COALESCE(NEW.revoked_at, NEW.reuse_detected_at);
      NEW.revoked_reason := COALESCE(NEW.revoked_reason, 'REFRESH_TOKEN_REUSE_DETECTED');
    END IF;

    RETURN NEW;
  END IF;

  SELECT * INTO family
  FROM identity.session_families
  WHERE id = NEW.family_id AND user_id = NEW.user_id
  FOR UPDATE;

  -- Let the declarative foreign key report a missing owner/family pair.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF family.revoked_at IS NOT NULL OR family.reuse_detected_at IS NOT NULL THEN
    RAISE EXCEPTION 'cannot issue a session in a terminated family'
      USING ERRCODE = '23514', CONSTRAINT = 'sessions_family_active_check';
  END IF;

  IF family.expires_at <= transaction_timestamp() THEN
    RAISE EXCEPTION 'cannot issue a session in an expired family'
      USING ERRCODE = '23514', CONSTRAINT = 'sessions_family_active_check';
  END IF;

  IF ROW(
    NEW.issued_session_epoch,
    NEW.actor_type,
    NEW.scope_type,
    NEW.scope_id
  ) IS DISTINCT FROM ROW(
    family.issued_session_epoch,
    family.actor_type,
    family.scope_type,
    family.scope_id
  )
    OR NEW.issued_at < family.created_at
    OR NEW.issued_at > transaction_timestamp()
    OR NEW.expires_at > family.expires_at
  THEN
    RAISE EXCEPTION 'session does not match its authoritative family binding'
      USING ERRCODE = '23514', CONSTRAINT = 'sessions_family_binding_check';
  END IF;

  IF NEW.rotated_from_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM identity.sessions AS existing
      WHERE existing.user_id = NEW.user_id AND existing.family_id = NEW.family_id
    ) THEN
      RAISE EXCEPTION 'session family already has a root generation'
        USING ERRCODE = '23514', CONSTRAINT = 'sessions_single_root_check';
    END IF;

    IF NEW.assurance_level = 'MFA'
      AND (
        NEW.mfa_completed_at IS NULL
        OR NEW.mfa_completed_at < family.created_at
        OR NEW.mfa_completed_at > NEW.issued_at
      )
    THEN
      RAISE EXCEPTION 'root session MFA evidence is outside the family issuance window'
        USING ERRCODE = '23514', CONSTRAINT = 'sessions_mfa_provenance_check';
    END IF;
  ELSE
    SELECT * INTO parent
    FROM identity.sessions AS predecessor
    WHERE predecessor.id = NEW.rotated_from_id
      AND predecessor.user_id = NEW.user_id
      AND predecessor.family_id = NEW.family_id
    FOR UPDATE;

    IF NOT FOUND
      OR parent.rotated_at IS NULL
      OR NEW.issued_at IS DISTINCT FROM parent.rotated_at
      OR NEW.issued_at >= parent.expires_at
      OR parent.revoked_at IS NOT NULL
      OR parent.reuse_detected_at IS NOT NULL
      OR ROW(NEW.assurance_level, NEW.mfa_completed_at)
        IS DISTINCT FROM ROW(parent.assurance_level, parent.mfa_completed_at)
    THEN
      RAISE EXCEPTION 'session child does not match a live direct predecessor'
        USING ERRCODE = '23514', CONSTRAINT = 'sessions_rotation_parent_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION identity.propagate_session_reuse_to_family()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
BEGIN
  IF OLD.reuse_detected_at IS NULL AND NEW.reuse_detected_at IS NOT NULL THEN
    UPDATE identity.session_families
    SET
      revoked_at = COALESCE(revoked_at, NEW.reuse_detected_at),
      revoked_reason = COALESCE(revoked_reason, 'REFRESH_TOKEN_REUSE_DETECTED'),
      reuse_detected_at = NEW.reuse_detected_at
    WHERE id = NEW.family_id
      AND user_id = NEW.user_id
      AND reuse_detected_at IS NULL;

    UPDATE identity.sessions
    SET
      revoked_at = NEW.reuse_detected_at,
      revoked_reason = 'REFRESH_TOKEN_REUSE_DETECTED'
    WHERE family_id = NEW.family_id
      AND user_id = NEW.user_id
      AND id <> NEW.id
      AND revoked_at IS NULL;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER sessions_propagate_reuse_to_family
  AFTER UPDATE OF reuse_detected_at ON identity.sessions
  FOR EACH ROW EXECUTE FUNCTION identity.propagate_session_reuse_to_family();

CREATE FUNCTION identity.enforce_active_session_family_topology()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
DECLARE
  family identity.session_families%ROWTYPE;
BEGIN
  SELECT * INTO family
  FROM identity.session_families
  WHERE id = NEW.family_id AND user_id = NEW.user_id;

  IF NOT FOUND
    OR family.revoked_at IS NOT NULL
    OR family.reuse_detected_at IS NOT NULL
    OR family.expires_at <= transaction_timestamp()
  THEN
    RETURN NULL;
  END IF;

  IF (
    SELECT count(*)
    FROM identity.sessions AS root
    WHERE root.user_id = NEW.user_id
      AND root.family_id = NEW.family_id
      AND root.rotated_from_id IS NULL
  ) <> 1
    OR (
      SELECT count(*)
      FROM identity.sessions AS current_generation
      WHERE current_generation.user_id = NEW.user_id
        AND current_generation.family_id = NEW.family_id
        AND current_generation.rotated_at IS NULL
        AND current_generation.revoked_at IS NULL
        AND current_generation.reuse_detected_at IS NULL
    ) <> 1
    OR EXISTS (
      SELECT 1
      FROM identity.sessions AS rotated_generation
      WHERE rotated_generation.user_id = NEW.user_id
        AND rotated_generation.family_id = NEW.family_id
        AND rotated_generation.rotated_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM identity.sessions AS child
          WHERE child.rotated_from_id = rotated_generation.id
        )
    )
  THEN
    RAISE EXCEPTION 'active session family has an incomplete or ambiguous lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'sessions_active_family_topology_check';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER sessions_validate_active_family_topology
  AFTER INSERT OR UPDATE ON identity.sessions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION identity.enforce_active_session_family_topology();

CREATE FUNCTION identity.reject_session_lifecycle_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
BEGIN
  RAISE EXCEPTION 'session and family lifecycle history cannot be deleted'
    USING ERRCODE = '55000', CONSTRAINT = 'identity_session_lifecycle_delete_prohibited';
END;
$$;

CREATE TRIGGER sessions_reject_delete
  BEFORE DELETE ON identity.sessions
  FOR EACH ROW EXECUTE FUNCTION identity.reject_session_lifecycle_delete();

CREATE TRIGGER session_families_reject_delete
  BEFORE DELETE ON identity.session_families
  FOR EACH ROW EXECUTE FUNCTION identity.reject_session_lifecycle_delete();

COMMENT ON CONSTRAINT sessions_reuse_state_time_check ON identity.sessions IS
  'Refresh-token reuse evidence is valid only for an already-rotated generation and cannot predate rotation.';
