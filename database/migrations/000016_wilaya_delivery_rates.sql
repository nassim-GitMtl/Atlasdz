-- Wilaya defaults and explicit commune overrides; no automatic commercial activation.
ALTER TABLE sellers.delivery_rates ADD COLUMN use_wilaya_rate boolean NOT NULL DEFAULT false;
CREATE TABLE sellers.wilaya_delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  wilaya_id uuid NOT NULL REFERENCES locations.wilayas(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  shipping_fee_minor integer NOT NULL CHECK (shipping_fee_minor BETWEEN 0 AND 2000000000),
  cod_collector text NOT NULL CHECK (cod_collector IN ('SELLER','SELLER_COURIER')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  UNIQUE(seller_id,wilaya_id),
  CHECK(updated_at >= created_at)
);
CREATE FUNCTION sellers.protect_wilaya_delivery_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Disable coverage instead of deleting history'; END IF;
  IF ROW(NEW.id,NEW.seller_id,NEW.wilaya_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.seller_id,OLD.wilaya_id,OLD.created_at)
    OR NEW.row_version <> OLD.row_version+1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Delivery rate identity and sequential versions are protected';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wilaya_delivery_rate_lifecycle BEFORE UPDATE OR DELETE ON sellers.wilaya_delivery_rates
  FOR EACH ROW EXECUTE FUNCTION sellers.protect_wilaya_delivery_rate();
