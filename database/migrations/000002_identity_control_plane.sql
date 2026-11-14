-- Session-backed principal resolution and authorization foundation.
-- This pre-production migration deliberately refuses to guess claims for existing sessions.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.sessions LIMIT 1) THEN
    RAISE EXCEPTION
      'identity.sessions must be empty before 000002; existing rows require an approved claims backfill';
  END IF;
END;
$$;

ALTER TABLE identity.sessions
  ADD COLUMN issued_session_epoch bigint NOT NULL CHECK (issued_session_epoch >= 1),
  ADD COLUMN actor_type text COLLATE "C" NOT NULL
    CHECK (actor_type IN ('customer', 'seller_user', 'staff', 'courier')),
  ADD COLUMN scope_type text COLLATE "C" NOT NULL
    CHECK (scope_type IN ('GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER')),
  ADD COLUMN scope_id uuid;

ALTER TABLE identity.sessions
  ADD CONSTRAINT sessions_scope_shape_check CHECK (
    (scope_type = 'GLOBAL' AND scope_id IS NULL)
    OR (scope_type <> 'GLOBAL' AND scope_id IS NOT NULL)
  ),
  ADD CONSTRAINT sessions_actor_scope_check CHECK (
    (actor_type = 'customer' AND scope_type = 'GLOBAL' AND scope_id IS NULL)
    OR (actor_type = 'seller_user' AND scope_type = 'SELLER' AND scope_id IS NOT NULL)
    OR (actor_type = 'courier' AND scope_type = 'COURIER' AND scope_id IS NOT NULL)
    OR (
      actor_type = 'staff'
      AND scope_type IN ('GLOBAL', 'WAREHOUSE')
      AND ((scope_type = 'GLOBAL') = (scope_id IS NULL))
    )
  ),
  ADD CONSTRAINT sessions_assurance_check CHECK (
    (assurance_level = 'MFA' AND mfa_completed_at IS NOT NULL)
    OR (assurance_level = 'PRIMARY' AND mfa_completed_at IS NULL)
  ),
  ADD CONSTRAINT sessions_privileged_mfa_check CHECK (
    actor_type NOT IN ('seller_user', 'staff') OR assurance_level = 'MFA'
  ),
  ADD CONSTRAINT sessions_reuse_revocation_check CHECK (
    reuse_detected_at IS NULL OR revoked_at IS NOT NULL
  );

CREATE UNIQUE INDEX sessions_one_current_generation_idx
  ON identity.sessions (user_id, family_id)
  WHERE rotated_at IS NULL AND revoked_at IS NULL;

CREATE INDEX sessions_principal_resolution_idx
  ON identity.sessions (id, user_id, family_id, expires_at)
  WHERE rotated_at IS NULL AND revoked_at IS NULL;

ALTER TABLE identity.roles
  ADD CONSTRAINT roles_id_assignment_scope_unique UNIQUE (id, assignment_scope_type);

ALTER TABLE identity.user_role_assignments
  ADD CONSTRAINT user_role_assignment_role_scope_fk
  FOREIGN KEY (role_id, scope_type)
  REFERENCES identity.roles (id, assignment_scope_type)
  ON DELETE RESTRICT;

-- Phase 0 versions events through event_version. Version suffixes in event_type are rejected
-- so the same version is not encoded twice.
ALTER TABLE platform.outbox_events
  DROP CONSTRAINT outbox_events_event_type_check,
  ADD CONSTRAINT outbox_events_event_type_check CHECK (
    event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
    AND event_type !~ '\.v[1-9][0-9]*$'
  ),
  ADD COLUMN actor_type text COLLATE "C" NOT NULL
    CHECK (actor_type IN ('anonymous', 'customer', 'seller_user', 'staff', 'courier', 'service'));

ALTER TABLE platform.inbox_messages
  DROP CONSTRAINT inbox_messages_event_type_check,
  ADD CONSTRAINT inbox_messages_event_type_check CHECK (
    event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
    AND event_type !~ '\.v[1-9][0-9]*$'
  );

CREATE OR REPLACE FUNCTION platform.protect_outbox_envelope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF ROW(
    NEW.event_id, NEW.event_type, NEW.event_version, NEW.producer,
    NEW.aggregate_type, NEW.aggregate_id, NEW.aggregate_version,
    NEW.payload, NEW.actor_type, NEW.actor_id, NEW.correlation_id,
    NEW.causation_id, NEW.occurred_at
  ) IS DISTINCT FROM ROW(
    OLD.event_id, OLD.event_type, OLD.event_version, OLD.producer,
    OLD.aggregate_type, OLD.aggregate_id, OLD.aggregate_version,
    OLD.payload, OLD.actor_type, OLD.actor_id, OLD.correlation_id,
    OLD.causation_id, OLD.occurred_at
  ) THEN
    RAISE EXCEPTION 'outbox event envelope is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
