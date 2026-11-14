-- Only the explicitly gated LOCAL/TEST checkout fixture may write this initial slice.
-- Production payment, delivery coverage, and shipping policies remain unapproved.
CREATE TABLE commerce.checkout_quotes (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  cart_version integer NOT NULL CHECK (cart_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'
    AND snapshot ?& ARRAY['id','cartVersion','dataClass','paymentArrangement']
    AND snapshot->>'id' = id::text
    AND (snapshot->>'cartVersion')::integer = cart_version
    AND snapshot->>'dataClass' = 'synthetic'
    AND snapshot->>'paymentArrangement' = 'TEST_ONLY_NO_PAYMENT'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  UNIQUE (id, customer_id)
);
CREATE INDEX checkout_quotes_customer_idx ON commerce.checkout_quotes(customer_id, created_at DESC);
CREATE TABLE commerce.orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  payment_state text NOT NULL DEFAULT 'NOT_APPLICABLE_TEST' CHECK (payment_state = 'NOT_APPLICABLE_TEST'),
  FOREIGN KEY (quote_id, customer_id) REFERENCES commerce.checkout_quotes(id, customer_id) ON DELETE RESTRICT
);
CREATE INDEX orders_customer_idx ON commerce.orders(customer_id, created_at DESC);
CREATE TABLE commerce.seller_orders (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND snapshot->>'sellerId' = seller_id::text),
  status text NOT NULL DEFAULT 'AWAITING_SELLER' CHECK (status IN ('AWAITING_SELLER','REJECTED','CANCELLED','EXPIRED')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL,
  acceptance_deadline timestamptz NOT NULL CHECK (acceptance_deadline > created_at),
  closed_at timestamptz,
  UNIQUE (order_id, seller_id),
  UNIQUE (id, seller_id),
  CHECK ((status = 'AWAITING_SELLER') = (closed_at IS NULL))
);
CREATE INDEX seller_orders_inbox_idx ON commerce.seller_orders(seller_id, created_at DESC, id);
CREATE INDEX seller_orders_due_idx ON commerce.seller_orders(acceptance_deadline, id) WHERE status = 'AWAITING_SELLER';
ALTER TABLE offers.offers ADD CONSTRAINT offers_id_seller_unique UNIQUE(id,seller_id);
CREATE TABLE commerce.stock_reservations (
  seller_order_id uuid NOT NULL,
  offer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  released_at timestamptz,
  FOREIGN KEY (seller_order_id,seller_id) REFERENCES commerce.seller_orders(id,seller_id) ON DELETE RESTRICT,
  FOREIGN KEY (offer_id,seller_id) REFERENCES offers.offers(id,seller_id) ON DELETE RESTRICT,
  CHECK (released_at IS NULL OR released_at >= created_at),
  PRIMARY KEY (seller_order_id, offer_id)
);

CREATE FUNCTION commerce.protect_reservation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reservation history cannot be deleted'; END IF;
  IF NEW.seller_order_id IS DISTINCT FROM OLD.seller_order_id OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'Reservation release is one-way and its snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_reservation_lifecycle BEFORE UPDATE OR DELETE ON commerce.stock_reservations FOR EACH ROW EXECUTE FUNCTION commerce.protect_reservation_history();

CREATE FUNCTION commerce.protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN ('checkout_quotes', 'orders') THEN
    RAISE EXCEPTION 'Order/quote snapshots are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Order history cannot be deleted'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.acceptance_deadline IS DISTINCT FROM OLD.acceptance_deadline THEN
    RAISE EXCEPTION 'Seller-order snapshots are immutable';
  END IF;
  IF OLD.status <> 'AWAITING_SELLER' OR NEW.status NOT IN ('REJECTED','CANCELLED','EXPIRED')
     OR NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'Invalid seller-order transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_checkout_quote BEFORE UPDATE OR DELETE ON commerce.checkout_quotes FOR EACH ROW EXECUTE FUNCTION commerce.protect_order_snapshot();
CREATE TRIGGER immutable_order BEFORE UPDATE OR DELETE ON commerce.orders FOR EACH ROW EXECUTE FUNCTION commerce.protect_order_snapshot();
CREATE TRIGGER seller_order_lifecycle BEFORE UPDATE OR DELETE ON commerce.seller_orders FOR EACH ROW EXECUTE FUNCTION commerce.protect_order_snapshot();

INSERT INTO identity.permissions(code,sensitivity,description) VALUES
  ('order.create','STANDARD','Create test checkout quotes and place own customer orders'),
  ('order.read','STANDARD','Read only own customer orders or scoped seller orders'),
  ('order.cancel','STANDARD','Cancel only own awaiting-seller orders'),
  ('order.reject','SENSITIVE','Reject only awaiting orders in the authenticated seller scope');
