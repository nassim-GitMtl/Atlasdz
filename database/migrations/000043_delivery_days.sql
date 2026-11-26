-- Seller-declared delivery time per destination (days after the order is shipped), shown to
-- buyers as the seller's own estimate next to the fee. Optional: NULL means "not stated".
ALTER TABLE sellers.delivery_rates
  ADD COLUMN delivery_min_days smallint,
  ADD COLUMN delivery_max_days smallint,
  ADD CONSTRAINT delivery_rates_days_check CHECK (
    (delivery_min_days IS NULL AND delivery_max_days IS NULL)
    OR (delivery_min_days BETWEEN 1 AND 30 AND delivery_max_days BETWEEN 1 AND 30
        AND delivery_max_days >= delivery_min_days));
ALTER TABLE sellers.wilaya_delivery_rates
  ADD COLUMN delivery_min_days smallint,
  ADD COLUMN delivery_max_days smallint,
  ADD CONSTRAINT wilaya_delivery_rates_days_check CHECK (
    (delivery_min_days IS NULL AND delivery_max_days IS NULL)
    OR (delivery_min_days BETWEEN 1 AND 30 AND delivery_max_days BETWEEN 1 AND 30
        AND delivery_max_days >= delivery_min_days));
