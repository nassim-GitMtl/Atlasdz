-- Private notes of a seller's team on one seller order (call attempts, confirmations, callbacks).
-- Never shown to the customer; kept with the order.
CREATE TABLE commerce.seller_order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL REFERENCES commerce.seller_orders (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  kind text COLLATE "C" NOT NULL
    CHECK (kind IN ('NOTE', 'CALL_NO_ANSWER', 'CALL_CONFIRMED', 'CALL_CALLBACK')),
  body text CHECK (body IS NULL OR char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (kind <> 'NOTE' OR body IS NOT NULL)
);
CREATE INDEX seller_order_notes_order_idx ON commerce.seller_order_notes (seller_order_id, created_at);
