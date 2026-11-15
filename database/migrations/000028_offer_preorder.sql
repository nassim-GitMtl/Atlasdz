-- Pre-order offers: the item is not in stock yet (often imported). The seller states an estimated
-- delivery window and, optionally, where it comes from; available_quantity is then the number of
-- pre-orders accepted. Existing offers stay in stock (preorder = false).
ALTER TABLE offers.offers
  ADD COLUMN preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN preorder_min_days smallint,
  ADD COLUMN preorder_max_days smallint,
  ADD COLUMN preorder_origin text,
  ADD CONSTRAINT offers_preorder_shape CHECK (
    (NOT preorder AND preorder_min_days IS NULL AND preorder_max_days IS NULL AND preorder_origin IS NULL)
    OR (preorder AND preorder_min_days BETWEEN 1 AND 180
      AND preorder_max_days BETWEEN preorder_min_days AND 180
      AND (preorder_origin IS NULL OR char_length(btrim(preorder_origin)) BETWEEN 2 AND 60))
  );
