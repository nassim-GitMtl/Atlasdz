-- A cart is an authenticated customer's saved intent, not an order or reservation.
CREATE SCHEMA commerce;
CREATE TABLE commerce.carts (
  customer_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE RESTRICT,
  row_version integer NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE commerce.cart_items (
  customer_id uuid NOT NULL REFERENCES commerce.carts(customer_id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES offers.offers(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (customer_id, offer_id)
);
INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('cart.manage', 'STANDARD', 'Read and change only the authenticated customer cart');
COMMENT ON TABLE commerce.cart_items IS 'Saved offer references; prices and availability are read live. Does not reserve stock or accept payment.';
