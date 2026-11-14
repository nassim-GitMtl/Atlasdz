-- Project Atlas DZ foundation schema.
-- This migration contains no real customer data and no unapproved business policy values.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS locations;

CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text COLLATE "C" NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'LOCKED', 'DISABLED')),
  preferred_locale text COLLATE "C" NOT NULL DEFAULT 'fr'
    CHECK (preferred_locale IN ('ar', 'fr', 'en')),
  session_epoch bigint NOT NULL DEFAULT 1 CHECK (session_epoch >= 1),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  disabled_at timestamptz,
  pseudonymized_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK (disabled_at IS NULL OR disabled_at >= created_at),
  CHECK (pseudonymized_at IS NULL OR pseudonymized_at >= created_at)
);

CREATE INDEX users_operational_status_idx
  ON identity.users (status, updated_at)
  WHERE status <> 'ACTIVE';

CREATE TABLE identity.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text COLLATE "C" NOT NULL UNIQUE
    CHECK (code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  assignment_scope_type text COLLATE "C" NOT NULL
    CHECK (assignment_scope_type IN ('GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER')),
  status text COLLATE "C" NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  is_system boolean NOT NULL DEFAULT true,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deprecated_at timestamptz,
  CHECK ((status = 'DEPRECATED') = (deprecated_at IS NOT NULL))
);

CREATE TABLE identity.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text COLLATE "C" NOT NULL UNIQUE
    CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  sensitivity text COLLATE "C" NOT NULL DEFAULT 'STANDARD'
    CHECK (sensitivity IN ('STANDARD', 'SENSITIVE', 'CRITICAL')),
  status text COLLATE "C" NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deprecated_at timestamptz,
  CHECK ((status = 'DEPRECATED') = (deprecated_at IS NOT NULL))
);

CREATE TABLE identity.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES identity.roles (id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES identity.permissions (id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  granted_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  valid_until timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 1 AND 500),
  CHECK (valid_until IS NULL OR valid_until > granted_at),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE UNIQUE INDEX role_permissions_one_active_idx
  ON identity.role_permissions (role_id, permission_id)
  WHERE revoked_at IS NULL;
CREATE INDEX role_permissions_permission_idx
  ON identity.role_permissions (permission_id, role_id);

CREATE TABLE identity.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES identity.roles (id) ON DELETE RESTRICT,
  scope_type text COLLATE "C" NOT NULL
    CHECK (scope_type IN ('GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER')),
  scope_id uuid,
  valid_from timestamptz NOT NULL DEFAULT transaction_timestamp(),
  valid_until timestamptz,
  granted_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  granted_reason text NOT NULL CHECK (char_length(granted_reason) BETWEEN 1 AND 500),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 1 AND 500),
  CHECK ((scope_type = 'GLOBAL' AND scope_id IS NULL)
      OR (scope_type <> 'GLOBAL' AND scope_id IS NOT NULL)),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE UNIQUE INDEX user_role_assignments_one_active_idx
  ON identity.user_role_assignments (
    user_id,
    role_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE revoked_at IS NULL;
CREATE INDEX user_role_assignments_role_idx
  ON identity.user_role_assignments (role_id, user_id);
CREATE INDEX user_role_assignments_scope_idx
  ON identity.user_role_assignments (scope_type, scope_id)
  WHERE scope_id IS NOT NULL;

CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  family_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  rotated_from_id uuid UNIQUE REFERENCES identity.sessions (id) ON DELETE RESTRICT,
  device_label text CHECK (device_label IS NULL OR char_length(device_label) BETWEEN 1 AND 120),
  device_hash bytea CHECK (device_hash IS NULL OR octet_length(device_hash) = 32),
  assurance_level text COLLATE "C" NOT NULL DEFAULT 'PRIMARY'
    CHECK (assurance_level IN ('PRIMARY', 'MFA')),
  issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  mfa_completed_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 1 AND 500),
  reuse_detected_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (last_seen_at IS NULL OR last_seen_at >= issued_at),
  CHECK (mfa_completed_at IS NULL OR mfa_completed_at >= issued_at),
  CHECK (rotated_at IS NULL OR rotated_at >= issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  CHECK ((revoked_at IS NULL AND revoked_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL))
);

CREATE INDEX sessions_user_family_idx ON identity.sessions (user_id, family_id);
CREATE INDEX sessions_active_user_idx
  ON identity.sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON identity.sessions (expires_at);

CREATE TABLE platform.feature_flag_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text COLLATE "C" NOT NULL
    CHECK (flag_key ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'),
  version integer NOT NULL CHECK (version >= 1),
  value_type text COLLATE "C" NOT NULL
    CHECK (value_type IN ('BOOLEAN', 'INTEGER', 'STRING')),
  default_value jsonb NOT NULL,
  fail_safe_value jsonb NOT NULL,
  rollout_conditions jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(rollout_conditions) = 'object'),
  state text COLLATE "C" NOT NULL DEFAULT 'DRAFT'
    CHECK (state IN ('DRAFT', 'ACTIVE', 'DISABLED', 'EXPIRED')),
  is_current boolean NOT NULL DEFAULT false,
  owner_ref text COLLATE "C" NOT NULL CHECK (char_length(owner_ref) BETWEEN 1 AND 120),
  change_reason text NOT NULL CHECK (char_length(change_reason) BETWEEN 1 AND 500),
  created_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  effective_at timestamptz,
  expires_at timestamptz,
  review_at timestamptz,
  UNIQUE (flag_key, version),
  CHECK (jsonb_typeof(default_value) = CASE value_type
    WHEN 'BOOLEAN' THEN 'boolean'
    WHEN 'INTEGER' THEN 'number'
    WHEN 'STRING' THEN 'string'
  END),
  CHECK (jsonb_typeof(fail_safe_value) = CASE value_type
    WHEN 'BOOLEAN' THEN 'boolean'
    WHEN 'INTEGER' THEN 'number'
    WHEN 'STRING' THEN 'string'
  END),
  CHECK (expires_at IS NULL OR effective_at IS NULL OR expires_at > effective_at),
  CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by)
);

CREATE UNIQUE INDEX feature_flag_versions_current_idx
  ON platform.feature_flag_versions (flag_key)
  WHERE is_current;

CREATE TABLE platform.audit_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type text COLLATE "C" NOT NULL
    CHECK (actor_type IN ('anonymous', 'customer', 'seller_user', 'staff', 'courier', 'service')),
  actor_id uuid,
  session_id uuid,
  effective_roles text[] NOT NULL DEFAULT '{}',
  scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(scope_snapshot) = 'object'),
  action text COLLATE "C" NOT NULL
    CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  outcome text COLLATE "C" NOT NULL CHECK (outcome IN ('SUCCEEDED', 'DENIED', 'FAILED')),
  entity_type text COLLATE "C" NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 100),
  entity_id uuid,
  entity_version bigint CHECK (entity_version IS NULL OR entity_version >= 1),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  ticket_ref text COLLATE "C" CHECK (ticket_ref IS NULL OR char_length(ticket_ref) <= 120),
  correlation_id text COLLATE "C" NOT NULL CHECK (char_length(correlation_id) BETWEEN 26 AND 36),
  trace_id text COLLATE "C" CHECK (trace_id IS NULL OR trace_id ~ '^[a-f0-9]{32}$'),
  before_data jsonb CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
  after_data jsonb CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  redaction_version integer NOT NULL DEFAULT 1 CHECK (redaction_version >= 1),
  previous_integrity_hash bytea
    CHECK (previous_integrity_hash IS NULL OR octet_length(previous_integrity_hash) = 32),
  integrity_hash bytea CHECK (integrity_hash IS NULL OR octet_length(integrity_hash) = 32),
  CHECK (recorded_at >= occurred_at)
);

CREATE INDEX audit_events_occurred_idx ON platform.audit_events (occurred_at DESC);
CREATE INDEX audit_events_actor_idx
  ON platform.audit_events (actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX audit_events_entity_idx
  ON platform.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_correlation_idx ON platform.audit_events (correlation_id);

CREATE FUNCTION platform.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON platform.audit_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON platform.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_audit_mutation();

CREATE TABLE platform.outbox_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text COLLATE "C" NOT NULL
    CHECK (event_type ~ '^[a-z][a-z0-9_.-]+\.v[1-9][0-9]*$'),
  event_version integer NOT NULL CHECK (event_version >= 1),
  producer text COLLATE "C" NOT NULL
    CHECK (producer ~ '^[a-z][a-z0-9-]{1,79}$'),
  aggregate_type text COLLATE "C" NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 100),
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version >= 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  actor_id uuid,
  correlation_id text COLLATE "C" NOT NULL CHECK (char_length(correlation_id) BETWEEN 26 AND 36),
  causation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  delivery_state text COLLATE "C" NOT NULL DEFAULT 'PENDING'
    CHECK (delivery_state IN ('PENDING', 'PUBLISHED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  locked_until timestamptz,
  locked_by text COLLATE "C" CHECK (locked_by IS NULL OR char_length(locked_by) <= 120),
  published_at timestamptz,
  last_error_code text COLLATE "C"
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  last_error_detail text CHECK (last_error_detail IS NULL OR char_length(last_error_detail) <= 500),
  CHECK ((delivery_state = 'PUBLISHED') = (published_at IS NOT NULL)),
  CHECK ((locked_until IS NULL AND locked_by IS NULL)
      OR (locked_until IS NOT NULL AND locked_by IS NOT NULL))
);

CREATE UNIQUE INDEX outbox_events_aggregate_version_idx
  ON platform.outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type);
CREATE INDEX outbox_events_pending_idx
  ON platform.outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;
CREATE INDEX outbox_events_published_idx
  ON platform.outbox_events (published_at)
  WHERE published_at IS NOT NULL;

CREATE FUNCTION platform.protect_outbox_envelope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF ROW(
    NEW.event_id, NEW.event_type, NEW.event_version, NEW.producer,
    NEW.aggregate_type, NEW.aggregate_id, NEW.aggregate_version,
    NEW.payload, NEW.actor_id, NEW.correlation_id, NEW.causation_id, NEW.occurred_at
  ) IS DISTINCT FROM ROW(
    OLD.event_id, OLD.event_type, OLD.event_version, OLD.producer,
    OLD.aggregate_type, OLD.aggregate_id, OLD.aggregate_version,
    OLD.payload, OLD.actor_id, OLD.correlation_id, OLD.causation_id, OLD.occurred_at
  ) THEN
    RAISE EXCEPTION 'outbox event envelope is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_protect_envelope
  BEFORE UPDATE ON platform.outbox_events
  FOR EACH ROW EXECUTE FUNCTION platform.protect_outbox_envelope();

CREATE TABLE platform.inbox_messages (
  consumer_name text COLLATE "C" NOT NULL
    CHECK (consumer_name ~ '^[a-z][a-z0-9-]{1,119}$'),
  event_id uuid NOT NULL,
  event_type text COLLATE "C" NOT NULL
    CHECK (event_type ~ '^[a-z][a-z0-9_.-]+\.v[1-9][0-9]*$'),
  event_version integer NOT NULL CHECK (event_version >= 1),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  status text COLLATE "C" NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  locked_until timestamptz,
  locked_by text COLLATE "C" CHECK (locked_by IS NULL OR char_length(locked_by) <= 120),
  processed_at timestamptz,
  last_error_code text COLLATE "C"
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  last_error_detail text CHECK (last_error_detail IS NULL OR char_length(last_error_detail) <= 500),
  PRIMARY KEY (consumer_name, event_id),
  CHECK ((status = 'PROCESSED') = (processed_at IS NOT NULL)),
  CHECK ((locked_until IS NULL AND locked_by IS NULL)
      OR (locked_until IS NOT NULL AND locked_by IS NOT NULL))
);

CREATE INDEX inbox_messages_retry_idx
  ON platform.inbox_messages (next_attempt_at, received_at)
  WHERE status IN ('RECEIVED', 'FAILED');
CREATE INDEX inbox_messages_processed_idx
  ON platform.inbox_messages (processed_at)
  WHERE processed_at IS NOT NULL;

CREATE TABLE locations.dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code text COLLATE "C" NOT NULL UNIQUE
    CHECK (version_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  source_name text NOT NULL CHECK (char_length(source_name) BETWEEN 1 AND 200),
  source_reference text NOT NULL CHECK (char_length(source_reference) BETWEEN 1 AND 500),
  source_sha256 text COLLATE "C" NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000)
);

CREATE UNIQUE INDEX dataset_versions_one_active_idx
  ON locations.dataset_versions ((is_active))
  WHERE is_active;

CREATE TABLE locations.wilayas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES locations.dataset_versions (id) ON DELETE RESTRICT,
  code text COLLATE "C" NOT NULL CHECK (code ~ '^[0-9]{2}$'),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) > 0),
  name_fr text NOT NULL CHECK (char_length(btrim(name_fr)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (dataset_version_id, code),
  UNIQUE (id, dataset_version_id)
);

CREATE TABLE locations.communes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES locations.dataset_versions (id) ON DELETE RESTRICT,
  wilaya_id uuid NOT NULL,
  code text COLLATE "C" NOT NULL CHECK (code ~ '^[A-Za-z0-9._-]{1,24}$'),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) > 0),
  name_fr text NOT NULL CHECK (char_length(btrim(name_fr)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (wilaya_id, dataset_version_id)
    REFERENCES locations.wilayas (id, dataset_version_id) ON DELETE RESTRICT,
  UNIQUE (dataset_version_id, code)
);

CREATE INDEX communes_wilaya_idx
  ON locations.communes (dataset_version_id, wilaya_id, code);

INSERT INTO platform.feature_flag_versions (
  flag_key,
  version,
  value_type,
  default_value,
  fail_safe_value,
  rollout_conditions,
  state,
  is_current,
  owner_ref,
  change_reason
) VALUES
  (
    'payments.electronic',
    1,
    'BOOLEAN',
    'false'::jsonb,
    'false'::jsonb,
    '{}'::jsonb,
    'DISABLED',
    true,
    'external-gate:payments',
    'Locked off until provider, legal, security, finance, certification, and operations gates close'
  ),
  (
    'finance.real_payouts',
    1,
    'BOOLEAN',
    'false'::jsonb,
    'false'::jsonb,
    '{}'::jsonb,
    'DISABLED',
    true,
    'external-gate:payouts',
    'Locked off until finance, accounting, provider, segregation-of-duties, and release gates close'
  );

COMMENT ON TABLE identity.users IS
  'Core principal lifecycle only. Identifiers, credentials, MFA factors, and challenges belong in separate tables.';
COMMENT ON COLUMN identity.sessions.token_hash IS
  'Keyed hash of a high-entropy refresh token; plaintext session tokens are prohibited.';
COMMENT ON TABLE platform.audit_events IS
  'Append-only application audit evidence. Triggers are defense in depth, not protection from database owners.';
COMMENT ON TABLE platform.outbox_events IS
  'Transactional event outbox. Envelope fields are immutable; delivery metadata is dispatcher-managed.';
COMMENT ON TABLE locations.dataset_versions IS
  'Authoritative source provenance is required before a dataset may be activated.';
