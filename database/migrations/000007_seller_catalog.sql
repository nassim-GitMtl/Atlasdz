-- Seller-owned catalog/stock only. No platform warehouse or fulfillment entities.
CREATE SCHEMA sellers;
CREATE SCHEMA catalog;
CREATE SCHEMA offers;

CREATE TABLE sellers.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text COLLATE "C" NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description_fr text NOT NULL CHECK (char_length(btrim(description_fr)) BETWEEN 1 AND 8000),
  description_ar text NOT NULL CHECK (char_length(btrim(description_ar)) BETWEEN 1 AND 8000),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1)
);

CREATE TABLE catalog.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text COLLATE "C" NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
  title_fr text NOT NULL CHECK (char_length(btrim(title_fr)) BETWEEN 1 AND 160),
  title_ar text NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  moderation_status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (moderation_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  restriction_class text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (restriction_class IN ('STANDARD', 'REVIEW_REQUIRED', 'PROHIBITED')),
  is_synthetic boolean NOT NULL DEFAULT false
);

CREATE TABLE catalog.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  slug text COLLATE "C" NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
  title_fr text NOT NULL CHECK (char_length(btrim(title_fr)) BETWEEN 1 AND 500),
  title_ar text NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 1 AND 500),
  description_fr text NOT NULL CHECK (char_length(btrim(description_fr)) BETWEEN 1 AND 8000),
  description_ar text NOT NULL CHECK (char_length(btrim(description_ar)) BETWEEN 1 AND 8000),
  image_url text NOT NULL CHECK (image_url ~ '^/assets/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif)$'),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  moderation_status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (moderation_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX products_category_idx ON catalog.products(category_id, slug);

CREATE TABLE catalog.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  sku text COLLATE "C" NOT NULL UNIQUE CHECK (char_length(sku) BETWEEN 1 AND 80),
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (id, product_id)
);
CREATE UNIQUE INDEX product_variants_default_idx ON catalog.product_variants(product_id) WHERE is_default;

CREATE TABLE offers.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL,
  price_minor integer NOT NULL CHECK (price_minor BETWEEN 1 AND 2000000000),
  currency text NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
  available_quantity integer NOT NULL CHECK (available_quantity BETWEEN 0 AND 1000000),
  handling_days integer NOT NULL CHECK (handling_days BETWEEN 0 AND 30),
  delivery_fee_minor integer NOT NULL CHECK (delivery_fee_minor BETWEEN 0 AND 2000000000),
  fulfillment_method text NOT NULL DEFAULT 'SELLER_FULFILLED' CHECK (fulfillment_method = 'SELLER_FULFILLED'),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  approved_at timestamptz,
  approved_by uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  is_synthetic boolean NOT NULL DEFAULT false,
  FOREIGN KEY (variant_id, product_id) REFERENCES catalog.product_variants(id, product_id) ON DELETE RESTRICT,
  UNIQUE (seller_id, variant_id),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CHECK (status <> 'APPROVED' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE INDEX offers_public_product_idx ON offers.offers(product_id, price_minor, id) WHERE status = 'APPROVED';
CREATE INDEX offers_seller_status_idx ON offers.offers(seller_id, status, created_at, id);

COMMENT ON COLUMN offers.offers.available_quantity IS 'Seller-owned available stock. Checkout reservations and stock mutation concurrency are introduced by the commerce slice.';
COMMENT ON COLUMN offers.offers.delivery_fee_minor IS 'Single-offer configured shipping charge; geographic coverage and multi-item shipping rules must be validated by checkout before accepting an order.';
