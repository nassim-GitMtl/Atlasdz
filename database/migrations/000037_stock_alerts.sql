-- "Tell me when it is back": a signed-in customer waits for a sold-out product. One waiting
-- alert per customer and product; it is emailed once, when an approved offer has stock again.
CREATE TABLE commerce.stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES catalog.products (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notified_at timestamptz
);
CREATE UNIQUE INDEX stock_alerts_waiting_idx ON commerce.stock_alerts (customer_id, product_id)
  WHERE notified_at IS NULL;
CREATE INDEX stock_alerts_product_idx ON commerce.stock_alerts (product_id)
  WHERE notified_at IS NULL;
