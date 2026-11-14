-- ADR-012: one seller-configured charge per seller order and destination.
-- Location activation and commercial checkout remain separate release gates.
CREATE TABLE sellers.delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers.sellers(id) ON DELETE RESTRICT,
  commune_id uuid NOT NULL REFERENCES locations.communes(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  shipping_fee_minor integer NOT NULL CHECK (shipping_fee_minor BETWEEN 0 AND 2000000000),
  cod_collector text NOT NULL CHECK (cod_collector IN ('SELLER','SELLER_COURIER')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  UNIQUE (seller_id,commune_id),
  CHECK (updated_at >= created_at)
);
CREATE FUNCTION sellers.protect_delivery_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Disable delivery coverage instead of deleting its history'; END IF;
  IF ROW(NEW.id,NEW.seller_id,NEW.commune_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.seller_id,OLD.commune_id,OLD.created_at)
    OR NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Delivery rate identity and sequential versions are protected';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER delivery_rate_lifecycle BEFORE UPDATE OR DELETE ON sellers.delivery_rates
  FOR EACH ROW EXECUTE FUNCTION sellers.protect_delivery_rate();
INSERT INTO identity.permissions(code,sensitivity,description) VALUES
  ('delivery.read','STANDARD','Read delivery configuration in the authenticated seller scope'),
  ('delivery.manage','SENSITIVE','Configure destination coverage, shipping charge and seller COD collector');
