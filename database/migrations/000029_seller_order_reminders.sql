-- At most one reminder per seller order still awaiting acceptance (sent by the API's
-- notification dispatcher a few hours after the order arrived).
CREATE TABLE commerce.seller_order_reminders (
  seller_order_id uuid PRIMARY KEY REFERENCES commerce.seller_orders(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
