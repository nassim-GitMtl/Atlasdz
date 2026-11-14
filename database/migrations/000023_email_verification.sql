-- Email ownership verification (required before a customer can place a live COD order).
ALTER TABLE identity.password_credentials ADD COLUMN email_verified_at timestamptz;

CREATE TABLE identity.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX email_verification_tokens_user_idx
  ON identity.email_verification_tokens (user_id, created_at DESC);
