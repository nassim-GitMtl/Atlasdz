-- Seller promotions: a lower price for a dated window (at most 90 days). While the window is
-- open, catalogue, cart and checkout use the promotional price and show the regular one.
ALTER TABLE offers.offers
  ADD COLUMN promo_price_minor integer,
  ADD COLUMN promo_starts_at timestamptz,
  ADD COLUMN promo_ends_at timestamptz,
  ADD CONSTRAINT offers_promotion_shape CHECK (
    (promo_price_minor IS NULL AND promo_starts_at IS NULL AND promo_ends_at IS NULL)
    OR (promo_price_minor > 0 AND promo_price_minor < price_minor
      AND promo_ends_at > promo_starts_at
      AND promo_ends_at <= promo_starts_at + interval '90 days')
  );
