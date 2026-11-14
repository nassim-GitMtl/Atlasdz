-- Production email/password identity, TOTP second factor, and system marketplace roles.
-- Secrets are never stored in clear text: passwords use scrypt, TOTP seeds use AES-256-GCM
-- with an application-held key (IDENTITY_SECRET_KEY).

CREATE TABLE identity.password_credentials (
  user_id uuid PRIMARY KEY REFERENCES identity.users (id) ON DELETE RESTRICT,
  email text COLLATE "C" NOT NULL UNIQUE
    CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254
      AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text COLLATE "C" NOT NULL
    CHECK (password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (updated_at >= created_at)
);

CREATE TABLE identity.totp_factors (
  user_id uuid PRIMARY KEY REFERENCES identity.users (id) ON DELETE RESTRICT,
  secret_ciphertext bytea NOT NULL CHECK (octet_length(secret_ciphertext) BETWEEN 40 AND 128),
  confirmed_at timestamptz,
  last_used_step bigint CHECK (last_used_step IS NULL OR last_used_step >= 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (confirmed_at IS NULL OR confirmed_at >= created_at),
  CHECK (last_used_step IS NULL OR confirmed_at IS NOT NULL)
);

INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('seller.approve', 'SENSITIVE', 'Review seller onboarding applications within the global staff scope');

INSERT INTO identity.roles (code, actor_type, assignment_scope_type, status, is_system, description) VALUES
  ('CUSTOMER', 'customer', 'GLOBAL', 'ACTIVE', true, 'Registered marketplace customer'),
  ('SELLER_OWNER', 'seller_user', 'SELLER', 'ACTIVE', true, 'Owner of one seller account'),
  ('MARKETPLACE_STAFF', 'staff', 'GLOBAL', 'ACTIVE', true, 'Marketplace moderation and support staff');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('CUSTOMER', 'cart.manage'),
  ('CUSTOMER', 'order.create'),
  ('CUSTOMER', 'order.read'),
  ('CUSTOMER', 'order.cancel'),
  ('CUSTOMER', 'order.confirm_delivery'),
  ('CUSTOMER', 'support.manage'),
  ('SELLER_OWNER', 'offer.create'),
  ('SELLER_OWNER', 'offer.read'),
  ('SELLER_OWNER', 'offer.update'),
  ('SELLER_OWNER', 'order.read'),
  ('SELLER_OWNER', 'order.reject'),
  ('SELLER_OWNER', 'order.process'),
  ('SELLER_OWNER', 'delivery.read'),
  ('SELLER_OWNER', 'delivery.manage'),
  ('SELLER_OWNER', 'support.manage'),
  ('SELLER_OWNER', 'product.submit'),
  ('MARKETPLACE_STAFF', 'offer.approve'),
  ('MARKETPLACE_STAFF', 'product.review'),
  ('MARKETPLACE_STAFF', 'support.escalations'),
  ('MARKETPLACE_STAFF', 'seller.approve')
) AS grants (role_code, permission_code)
JOIN identity.roles r ON r.code = grants.role_code
JOIN identity.permissions p ON p.code = grants.permission_code;

ALTER TABLE sellers.sellers
  ADD COLUMN review_reason text CHECK (review_reason IS NULL OR char_length(btrim(review_reason)) BETWEEN 1 AND 1000),
  ADD COLUMN reviewed_by uuid REFERENCES identity.users (id) ON DELETE RESTRICT,
  ADD COLUMN reviewed_at timestamptz,
  ADD CONSTRAINT sellers_review_shape CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL));

CREATE INDEX sellers_pending_review_idx ON sellers.sellers (created_at, id)
  WHERE status = 'PENDING_REVIEW';
