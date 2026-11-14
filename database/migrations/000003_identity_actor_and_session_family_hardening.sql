-- Bind authorization grants to actor identities and make session-family state authoritative.
-- A migration cannot safely infer whether an untyped GLOBAL role was intended for customers or
-- staff. The only automatic GLOBAL mapping is the deterministic LOCAL/TEST seed role; every
-- other pre-existing GLOBAL role requires an explicitly reviewed environment-specific mapping.

ALTER TABLE identity.roles
  ADD COLUMN actor_type text COLLATE "C";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM identity.roles
    WHERE assignment_scope_type = 'GLOBAL'
      AND code <> 'LOCAL_TEST_OPERATOR'
  ) THEN
    RAISE EXCEPTION
      'GLOBAL roles require an explicit customer-or-staff actor mapping before 000003 can run';
  END IF;
END;
$$;

UPDATE identity.roles
SET actor_type = CASE assignment_scope_type
  WHEN 'SELLER' THEN 'seller_user'
  WHEN 'WAREHOUSE' THEN 'staff'
  WHEN 'COURIER' THEN 'courier'
  WHEN 'GLOBAL' THEN CASE
    WHEN code = 'LOCAL_TEST_OPERATOR' THEN 'staff'
  END
END;

ALTER TABLE identity.roles
  ALTER COLUMN actor_type SET NOT NULL,
  ADD CONSTRAINT roles_actor_scope_check CHECK (
    (actor_type = 'customer' AND assignment_scope_type = 'GLOBAL')
    OR (actor_type = 'seller_user' AND assignment_scope_type = 'SELLER')
    OR (actor_type = 'courier' AND assignment_scope_type = 'COURIER')
    OR (actor_type = 'staff' AND assignment_scope_type IN ('GLOBAL', 'WAREHOUSE'))
  );

ALTER TABLE identity.user_role_assignments
  ADD COLUMN actor_type text COLLATE "C";

UPDATE identity.user_role_assignments AS assignment
SET actor_type = role.actor_type
FROM identity.roles AS role
WHERE role.id = assignment.role_id;

ALTER TABLE identity.user_role_assignments
  ALTER COLUMN actor_type SET NOT NULL,
  ADD CONSTRAINT user_role_assignments_actor_type_check CHECK (
    actor_type IN ('customer', 'seller_user', 'staff', 'courier')
  ),
  DROP CONSTRAINT user_role_assignment_role_scope_fk;

ALTER TABLE identity.roles
  DROP CONSTRAINT roles_id_assignment_scope_unique,
  ADD CONSTRAINT roles_id_scope_actor_unique
    UNIQUE (id, assignment_scope_type, actor_type);

ALTER TABLE identity.user_role_assignments
  ADD CONSTRAINT user_role_assignment_role_scope_actor_fk
  FOREIGN KEY (role_id, scope_type, actor_type)
  REFERENCES identity.roles (id, assignment_scope_type, actor_type)
  ON DELETE RESTRICT;

CREATE INDEX user_role_assignments_actor_scope_idx
  ON identity.user_role_assignments (user_id, actor_type, scope_type, scope_id);

-- MFA evidence belongs to the authenticated session lineage, not to the instant each refresh
-- generation is minted. A rotated generation may therefore inherit an earlier verified MFA
-- timestamp; it still cannot claim MFA without evidence or place that evidence after expiry.
DO $$
DECLARE
  legacy_constraints name[];
BEGIN
  SELECT array_agg(constraint_record.conname ORDER BY constraint_record.conname)
  INTO legacy_constraints
  FROM pg_constraint AS constraint_record
  WHERE constraint_record.conrelid = 'identity.sessions'::regclass
    AND constraint_record.contype = 'c'
    AND position(
      'mfa_completed_at' IN pg_get_constraintdef(constraint_record.oid)
    ) > 0
    AND position('issued_at' IN pg_get_constraintdef(constraint_record.oid)) > 0;

  IF cardinality(legacy_constraints) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'expected exactly one legacy session MFA timestamp constraint, found %',
      COALESCE(cardinality(legacy_constraints), 0);
  END IF;

  EXECUTE format(
    'ALTER TABLE identity.sessions DROP CONSTRAINT %I',
    legacy_constraints[1]
  );
END;
$$;

ALTER TABLE identity.sessions
  ADD CONSTRAINT sessions_mfa_evidence_time_check CHECK (
    mfa_completed_at IS NULL OR mfa_completed_at <= expires_at
  );

CREATE TABLE identity.session_families (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  issued_session_epoch bigint NOT NULL CHECK (issued_session_epoch >= 1),
  actor_type text COLLATE "C" NOT NULL
    CHECK (actor_type IN ('customer', 'seller_user', 'staff', 'courier')),
  scope_type text COLLATE "C" NOT NULL
    CHECK (scope_type IN ('GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER')),
  scope_id uuid,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
    CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 1 AND 500),
  reuse_detected_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  CONSTRAINT session_families_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT session_families_scope_shape_check CHECK (
    (scope_type = 'GLOBAL' AND scope_id IS NULL)
    OR (scope_type <> 'GLOBAL' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT session_families_actor_scope_check CHECK (
    (actor_type = 'customer' AND scope_type = 'GLOBAL' AND scope_id IS NULL)
    OR (actor_type = 'seller_user' AND scope_type = 'SELLER' AND scope_id IS NOT NULL)
    OR (actor_type = 'courier' AND scope_type = 'COURIER' AND scope_id IS NOT NULL)
    OR (
      actor_type = 'staff'
      AND scope_type IN ('GLOBAL', 'WAREHOUSE')
      AND ((scope_type = 'GLOBAL') = (scope_id IS NULL))
    )
  ),
  CONSTRAINT session_families_time_check CHECK (expires_at > created_at),
  CONSTRAINT session_families_revocation_check CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
  ),
  CONSTRAINT session_families_reuse_revocation_check CHECK (
    reuse_detected_at IS NULL OR revoked_at IS NOT NULL
  ),
  CONSTRAINT session_families_lifecycle_time_check CHECK (
    (revoked_at IS NULL OR revoked_at >= created_at)
    AND (reuse_detected_at IS NULL OR reuse_detected_at >= created_at)
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM identity.sessions
    GROUP BY family_id
    HAVING count(DISTINCT ROW(
      user_id,
      issued_session_epoch,
      actor_type,
      scope_type,
      scope_id
    )) > 1
  ) THEN
    RAISE EXCEPTION
      'session family contains conflicting owner or authorization bindings; approved remediation is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM identity.sessions AS child
    INNER JOIN identity.sessions AS parent ON parent.id = child.rotated_from_id
    WHERE ROW(child.user_id, child.family_id)
      IS DISTINCT FROM ROW(parent.user_id, parent.family_id)
  ) THEN
    RAISE EXCEPTION
      'session rotation crosses an owner or family boundary; approved remediation is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM identity.sessions
    WHERE reuse_detected_at IS NOT NULL AND reuse_detected_at < issued_at
  ) THEN
    RAISE EXCEPTION
      'session reuse evidence predates its session; approved remediation is required';
  END IF;
END;
$$;

INSERT INTO identity.session_families (
  id,
  user_id,
  issued_session_epoch,
  actor_type,
  scope_type,
  scope_id,
  created_at,
  expires_at,
  revoked_at,
  revoked_reason,
  reuse_detected_at
)
SELECT
  family_id,
  min(user_id::text)::uuid,
  min(issued_session_epoch),
  min(actor_type),
  min(scope_type),
  min(scope_id::text)::uuid,
  min(issued_at),
  max(expires_at),
  CASE
    WHEN min(reuse_detected_at) IS NOT NULL
      THEN COALESCE(min(revoked_at), min(reuse_detected_at))
    WHEN bool_and(rotated_at IS NOT NULL OR revoked_at IS NOT NULL)
      THEN COALESCE(
        min(revoked_at) FILTER (WHERE rotated_at IS NULL),
        max(rotated_at),
        max(revoked_at)
      )
    ELSE NULL
  END,
  CASE
    WHEN min(reuse_detected_at) IS NOT NULL THEN 'REFRESH_TOKEN_REUSE_DETECTED'
    WHEN bool_and(rotated_at IS NOT NULL OR revoked_at IS NOT NULL)
      THEN COALESCE(
        min(revoked_reason) FILTER (WHERE rotated_at IS NULL),
        'MIGRATED_REVOKED_FAMILY'
      )
    ELSE NULL
  END,
  min(reuse_detected_at)
FROM identity.sessions
GROUP BY family_id;

ALTER TABLE identity.sessions
  ADD CONSTRAINT sessions_id_family_owner_unique UNIQUE (id, family_id, user_id),
  ADD CONSTRAINT sessions_family_owner_fk
    FOREIGN KEY (family_id, user_id)
    REFERENCES identity.session_families (id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT sessions_rotation_family_owner_fk
    FOREIGN KEY (rotated_from_id, family_id, user_id)
    REFERENCES identity.sessions (id, family_id, user_id)
    MATCH SIMPLE
    ON DELETE RESTRICT;

CREATE INDEX session_families_active_user_idx
  ON identity.session_families (user_id, expires_at)
  WHERE revoked_at IS NULL AND reuse_detected_at IS NULL;

CREATE FUNCTION identity.protect_session_family_state()
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
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.user_id,
    OLD.issued_session_epoch,
    OLD.actor_type,
    OLD.scope_type,
    OLD.scope_id,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'session family identity is immutable'
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

  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_families_protect_state
  BEFORE UPDATE ON identity.session_families
  FOR EACH ROW EXECUTE FUNCTION identity.protect_session_family_state();

CREATE FUNCTION identity.enforce_session_family_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, identity
AS $$
DECLARE
  family identity.session_families%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.id,
      NEW.user_id,
      NEW.family_id,
      NEW.issued_session_epoch,
      NEW.actor_type,
      NEW.scope_type,
      NEW.scope_id,
      NEW.issued_at,
      NEW.expires_at,
      NEW.rotated_from_id
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.user_id,
      OLD.family_id,
      OLD.issued_session_epoch,
      OLD.actor_type,
      OLD.scope_type,
      OLD.scope_id,
      OLD.issued_at,
      OLD.expires_at,
      OLD.rotated_from_id
    ) THEN
      RAISE EXCEPTION 'session identity and lineage are immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sessions_identity_immutable';
    END IF;

    IF (OLD.rotated_at IS NOT NULL AND NEW.rotated_at IS DISTINCT FROM OLD.rotated_at)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
      OR (
        OLD.reuse_detected_at IS NOT NULL
        AND NEW.reuse_detected_at IS DISTINCT FROM OLD.reuse_detected_at
      )
    THEN
      RAISE EXCEPTION 'session terminal lifecycle evidence is immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sessions_lifecycle_immutable';
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
  ) OR NEW.issued_at < family.created_at OR NEW.expires_at > family.expires_at THEN
    RAISE EXCEPTION 'session does not match its authoritative family binding'
      USING ERRCODE = '23514', CONSTRAINT = 'sessions_family_binding_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_enforce_family_binding
  BEFORE INSERT OR UPDATE ON identity.sessions
  FOR EACH ROW EXECUTE FUNCTION identity.enforce_session_family_binding();

COMMENT ON TABLE identity.session_families IS
  'Authoritative owner, authorization binding, lifetime, revocation, and reuse state for refresh-token families.';
COMMENT ON COLUMN identity.roles.actor_type IS
  'Actor boundary for this role. Scope equality alone never authorizes a principal of another actor type.';
