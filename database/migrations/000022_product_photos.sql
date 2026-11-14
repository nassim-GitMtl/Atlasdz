-- Seller-uploaded product photos stored by the API on a persistent volume.
CREATE TABLE catalog.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products (id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES sellers.sellers (id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  content_type text COLLATE "C" NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 text COLLATE "C" NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX product_media_product_idx ON catalog.product_media (product_id, created_at DESC);

ALTER TABLE catalog.products DROP CONSTRAINT products_image_url_check;
ALTER TABLE catalog.products ADD CONSTRAINT products_image_url_check CHECK (
  image_url ~ '^/assets/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif)$'
  OR image_url = '/assets/product-placeholder.svg'
  OR image_url ~ '^/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
