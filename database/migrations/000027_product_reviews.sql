-- A review is a buyer's own rating of an item they received. It never changes the order, the
-- offer, stock or money. The buyer can edit or delete it, the seller can publish one reply, and
-- staff can hide it with a reason. Deleting the buyer's account deletes their reviews.
CREATE TABLE commerce.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text CHECK (body IS NULL OR char_length(btrim(body)) BETWEEN 2 AND 1000),
  reply text CHECK (reply IS NULL OR char_length(btrim(reply)) BETWEEN 2 AND 1000),
  replied_at timestamptz,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','HIDDEN')),
  moderation_reason text CHECK (moderation_reason IS NULL OR char_length(btrim(moderation_reason)) BETWEEN 3 AND 500),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (seller_order_id, product_id),
  FOREIGN KEY (seller_order_id, seller_id) REFERENCES commerce.seller_orders(id, seller_id) ON DELETE RESTRICT,
  CHECK ((reply IS NULL) = (replied_at IS NULL)),
  CHECK ((status = 'HIDDEN') = (moderation_reason IS NOT NULL)),
  CHECK (updated_at >= created_at)
);
CREATE INDEX product_reviews_product_idx ON commerce.product_reviews(product_id, created_at DESC, id) WHERE status = 'PUBLISHED';
CREATE INDEX product_reviews_seller_idx ON commerce.product_reviews(seller_id, created_at DESC, id);
CREATE INDEX product_reviews_customer_idx ON commerce.product_reviews(customer_id);
CREATE INDEX product_reviews_recent_idx ON commerce.product_reviews(created_at DESC, id);

CREATE FUNCTION commerce.check_product_review_eligibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
    WHERE so.id = NEW.seller_order_id AND so.seller_id = NEW.seller_id
      AND o.customer_id = NEW.customer_id
      AND so.status IN ('DELIVERY_REPORTED','DELIVERED')
      AND so.snapshot->'items' @> jsonb_build_array(jsonb_build_object('productId', NEW.product_id::text))
  ) THEN
    RAISE EXCEPTION 'Only a delivered item of the buyer''s own order can be reviewed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_review_eligibility BEFORE INSERT ON commerce.product_reviews
  FOR EACH ROW EXECUTE FUNCTION commerce.check_product_review_eligibility();

CREATE FUNCTION commerce.protect_product_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.seller_order_id IS DISTINCT FROM OLD.seller_order_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Invalid review version or identity change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_review_identity BEFORE UPDATE ON commerce.product_reviews
  FOR EACH ROW EXECUTE FUNCTION commerce.protect_product_review();

INSERT INTO identity.permissions(code,sensitivity,description) VALUES
  ('review.write','STANDARD','Rate and review items of own delivered orders'),
  ('review.reply','STANDARD','Read and publicly answer reviews of own seller orders'),
  ('review.moderate','SENSITIVE','Hide or restore customer reviews as staff');
INSERT INTO identity.role_permissions(role_id,permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('CUSTOMER','review.write'),
  ('SELLER_OWNER','review.reply'),
  ('MARKETPLACE_STAFF','review.moderate')
) AS grants(role_code, permission_code)
JOIN identity.roles r ON r.code = grants.role_code
JOIN identity.permissions p ON p.code = grants.permission_code;
