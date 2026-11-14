-- Cash-on-delivery abuse controls: verified customer phone (SMS OTP) and lookups for limits.
ALTER TABLE identity.password_credentials
  ADD COLUMN phone_e164 text COLLATE "C" CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN phone_verified_at timestamptz,
  ADD CONSTRAINT phone_verified_shape CHECK (phone_verified_at IS NULL OR phone_e164 IS NOT NULL);

CREATE TABLE identity.phone_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  phone_e164 text COLLATE "C" NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash bytea NOT NULL CHECK (octet_length(code_hash) = 32),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX phone_verification_codes_user_idx
  ON identity.phone_verification_codes (user_id, created_at DESC);

-- Open-order counts per delivery phone across accounts.
CREATE INDEX checkout_quotes_delivery_phone_idx
  ON commerce.checkout_quotes ((snapshot->'deliveryContact'->>'phone'));
CREATE INDEX seller_orders_status_idx ON commerce.seller_orders (status, order_id);
