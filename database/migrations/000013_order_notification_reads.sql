-- In-app notifications are the existing immutable order history, not provider delivery claims.
-- Per-user read markers never alter an order, stock, payment or fulfillment state.
CREATE TABLE commerce.order_notification_reads (
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  seller_order_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, seller_order_id, version),
  FOREIGN KEY (seller_order_id, version)
    REFERENCES commerce.seller_order_history(seller_order_id, version) ON DELETE RESTRICT
);

CREATE FUNCTION commerce.protect_notification_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Notification read markers cannot be deleted'; END IF;
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Notification read markers are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_notification_read BEFORE UPDATE OR DELETE
  ON commerce.order_notification_reads FOR EACH ROW
  EXECUTE FUNCTION commerce.protect_notification_read();
