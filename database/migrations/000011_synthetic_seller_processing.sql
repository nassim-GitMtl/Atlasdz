-- Synthetic-only lifecycle extension. No provider action, payment or physical delivery is invoked.
ALTER TABLE commerce.seller_orders DROP CONSTRAINT seller_orders_status_check;
-- In locked 000010, check2 is the awaiting/closed rule. The unsuffixed check
-- protects snapshot seller ownership and must remain in place.
ALTER TABLE commerce.seller_orders DROP CONSTRAINT seller_orders_check2;
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_status_valid CHECK
  (status IN ('AWAITING_SELLER','ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED','DELIVERED','DELIVERY_FAILED','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_closed_state CHECK
  ((status IN ('REJECTED','CANCELLED','EXPIRED','DELIVERED','DELIVERY_FAILED')) = (closed_at IS NOT NULL));
ALTER TABLE commerce.seller_orders ADD COLUMN shipment jsonb;
ALTER TABLE commerce.seller_orders ADD COLUMN rejection_reason text;
-- Preserve the exact meaning of already recorded generic test refusals.
-- Temporarily suppress only the lifecycle trigger while enriching this additive metadata.
ALTER TABLE commerce.seller_orders DISABLE TRIGGER seller_order_lifecycle;
UPDATE commerce.seller_orders SET rejection_reason='LEGACY_TEST_REJECTION' WHERE status='REJECTED';
ALTER TABLE commerce.seller_orders ENABLE TRIGGER seller_order_lifecycle;
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_rejection_reason CHECK
  ((status = 'REJECTED') = (rejection_reason IS NOT NULL));
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_rejection_code CHECK
  (rejection_reason IS NULL OR rejection_reason IN ('OUT_OF_STOCK','DELIVERY_UNAVAILABLE','UNABLE_TO_FULFILL','LEGACY_TEST_REJECTION'));
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_shipment_state CHECK
  ((status IN ('SHIPPED','DELIVERY_REPORTED','DELIVERED','DELIVERY_FAILED')) = (shipment IS NOT NULL));
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_test_shipment CHECK
  (shipment IS NULL OR (jsonb_typeof(shipment)='object' AND shipment ?& ARRAY['method','carrier','trackingReference']
   AND shipment->>'method'='SELLER_ARRANGED_TEST'));
ALTER TABLE commerce.stock_reservations ADD COLUMN consumed_at timestamptz;
ALTER TABLE commerce.stock_reservations ADD CONSTRAINT reservation_consumption CHECK
  (consumed_at IS NULL OR (consumed_at >= created_at AND released_at IS NULL));

CREATE TABLE commerce.seller_order_history (
  seller_order_id uuid NOT NULL REFERENCES commerce.seller_orders(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK(version > 0),
  status text NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('customer','seller_user','service')),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL,
  CHECK ((status='AWAITING_SELLER' AND actor_type='customer' AND reason='PLACED')
    OR (status='CANCELLED' AND actor_type='customer' AND reason='CUSTOMER_CANCELLED')
    OR (status='EXPIRED' AND actor_type='service' AND reason='DEADLINE_EXPIRED')
    OR (status='DELIVERED' AND actor_type='customer' AND reason='CONFIRM_DELIVERY')
    OR (status IN ('ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED','DELIVERY_FAILED','REJECTED') AND actor_type='seller_user')),
  PRIMARY KEY(seller_order_id,version)
);
INSERT INTO commerce.seller_order_history(seller_order_id,version,status,actor_type,actor_id,occurred_at,reason)
SELECT a.entity_id,a.entity_version,a.after_data->>'status',a.actor_type,a.actor_id,a.occurred_at,a.after_data->>'reason'
FROM platform.audit_events a JOIN commerce.seller_orders so ON so.id=a.entity_id
WHERE a.entity_type='seller_order' AND a.action IN ('seller_order.routed','seller_order.closed');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM commerce.seller_orders so WHERE
    (SELECT count(*) FROM commerce.seller_order_history h WHERE h.seller_order_id=so.id) <> so.row_version
    OR NOT EXISTS(SELECT 1 FROM commerce.seller_order_history h WHERE h.seller_order_id=so.id AND h.version=so.row_version AND h.status=so.status)) THEN
    RAISE EXCEPTION 'Existing order history cannot be reconstructed from immutable audit';
  END IF;
END $$;
CREATE FUNCTION commerce.protect_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Order history is append-only'; END $$;
CREATE TRIGGER immutable_seller_order_history BEFORE UPDATE OR DELETE ON commerce.seller_order_history FOR EACH ROW EXECUTE FUNCTION commerce.protect_order_history();

CREATE OR REPLACE FUNCTION commerce.protect_reservation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history cannot be deleted'; END IF;
  IF NEW.seller_order_id IS DISTINCT FROM OLD.seller_order_id OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.released_at IS NOT NULL OR OLD.consumed_at IS NOT NULL
    OR ((NEW.released_at IS NOT NULL)::integer + (NEW.consumed_at IS NOT NULL)::integer) <> 1 THEN
    RAISE EXCEPTION 'Reservation may only be released or consumed once';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION commerce.protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN ('checkout_quotes','orders') THEN RAISE EXCEPTION 'Order/quote snapshots are immutable'; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order history cannot be deleted'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.acceptance_deadline IS DISTINCT FROM OLD.acceptance_deadline
    OR (OLD.shipment IS NOT NULL AND NEW.shipment IS DISTINCT FROM OLD.shipment)
    OR (OLD.rejection_reason IS NOT NULL AND NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason) THEN
    RAISE EXCEPTION 'Seller-order snapshots are immutable';
  END IF;
  IF NEW.row_version <> OLD.row_version+1 OR NOT (
    (OLD.status='AWAITING_SELLER' AND NEW.status IN ('ACCEPTED','REJECTED','CANCELLED','EXPIRED')) OR
    (OLD.status='ACCEPTED' AND NEW.status='PREPARING') OR
    (OLD.status='PREPARING' AND NEW.status='SHIPPED') OR
    (OLD.status='SHIPPED' AND NEW.status IN ('DELIVERY_REPORTED','DELIVERY_FAILED')) OR
    (OLD.status='DELIVERY_REPORTED' AND NEW.status='DELIVERED')) THEN
    RAISE EXCEPTION 'Invalid seller-order transition';
  END IF;
  IF NEW.status='ACCEPTED' AND OLD.acceptance_deadline <= clock_timestamp() THEN
    RAISE EXCEPTION 'Acceptance deadline has expired';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION commerce.check_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_order commerce.seller_orders%ROWTYPE; target_id uuid;
BEGIN
  IF TG_TABLE_NAME='seller_order_history' THEN target_id:=NEW.seller_order_id; ELSE target_id:=NEW.id; END IF;
  SELECT * INTO current_order FROM commerce.seller_orders WHERE id=target_id;
  IF (SELECT count(*) FROM commerce.seller_order_history WHERE seller_order_id=target_id AND version<=current_order.row_version) <> current_order.row_version
    OR (SELECT count(*) FROM commerce.seller_order_history WHERE seller_order_id=target_id) <> current_order.row_version
    OR NOT EXISTS(SELECT 1 FROM commerce.seller_order_history WHERE seller_order_id=target_id AND version=current_order.row_version AND status=current_order.status) THEN
    RAISE EXCEPTION 'Every order version needs matching history';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER seller_order_history_required AFTER INSERT OR UPDATE ON commerce.seller_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce.check_order_history();
CREATE CONSTRAINT TRIGGER seller_order_history_matches AFTER INSERT ON commerce.seller_order_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce.check_order_history();
INSERT INTO identity.permissions(code,sensitivity,description) VALUES
  ('order.process','SENSITIVE','Process only scoped seller orders with attributed test updates'),
  ('order.confirm_delivery','STANDARD','Confirm receipt only for own seller-reported deliveries');
