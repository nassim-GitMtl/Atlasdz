-- Customers report a listing (counterfeit, prohibited, misleading, offensive, other); staff
-- dismiss the reports or remove the product. One open report per customer and product.
CREATE TABLE catalog.product_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  reason text COLLATE "C" NOT NULL
    CHECK (reason IN ('COUNTERFEIT', 'PROHIBITED', 'MISLEADING', 'OFFENSIVE', 'OTHER')),
  details text CHECK (details IS NULL OR char_length(btrim(details)) BETWEEN 1 AND 500),
  status text COLLATE "C" NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DISMISSED', 'ACTIONED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES identity.users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX product_reports_open_idx ON catalog.product_reports (product_id, reporter_id)
  WHERE status = 'OPEN';
CREATE INDEX product_reports_status_idx ON catalog.product_reports (status, created_at DESC);
