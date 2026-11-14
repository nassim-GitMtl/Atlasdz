-- Seller product proposals are private until separately reviewed by catalog staff.
INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('product.submit', 'SENSITIVE', 'Submit and read products within the approved seller scope'),
  ('product.review', 'SENSITIVE', 'Review seller product proposals within the global staff scope');

CREATE TABLE catalog.product_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  title_fr text NOT NULL CHECK (char_length(btrim(title_fr)) BETWEEN 1 AND 500),
  title_ar text NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 1 AND 500),
  description_fr text NOT NULL CHECK (char_length(btrim(description_fr)) BETWEEN 1 AND 8000),
  description_ar text NOT NULL CHECK (char_length(btrim(description_ar)) BETWEEN 1 AND 8000),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  product_id uuid UNIQUE REFERENCES catalog.products(id) ON DELETE RESTRICT,
  review_reason text CHECK (char_length(btrim(review_reason)) BETWEEN 1 AND 1000),
  reviewed_by uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (seller_id, request_id),
  CHECK ((status = 'APPROVED') = (product_id IS NOT NULL)),
  CHECK ((status = 'PENDING_REVIEW') = (reviewed_by IS NULL)),
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
  CHECK ((status = 'REJECTED') = (review_reason IS NOT NULL))
);
CREATE INDEX product_submissions_seller_idx ON catalog.product_submissions(seller_id, created_at DESC, id);
CREATE INDEX product_submissions_pending_idx ON catalog.product_submissions(created_at, id) WHERE status = 'PENDING_REVIEW';

ALTER TABLE catalog.products DROP CONSTRAINT products_image_url_check;
ALTER TABLE catalog.products ADD CONSTRAINT products_image_url_check CHECK (
  image_url ~ '^/assets/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif)$'
  OR image_url = '/assets/product-placeholder.svg'
);
