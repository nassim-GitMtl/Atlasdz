-- Seller-entered product characteristics (fixed attribute keys, free-text values). They are
-- reviewed with the submission and copied to the product on approval, like title/description.
ALTER TABLE catalog.product_submissions
  ADD COLUMN specs jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT product_submissions_specs_check
    CHECK (jsonb_typeof(specs) = 'array' AND jsonb_array_length(specs) <= 11);

ALTER TABLE catalog.products
  ADD COLUMN specs jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT products_specs_check
    CHECK (jsonb_typeof(specs) = 'array' AND jsonb_array_length(specs) <= 11);
