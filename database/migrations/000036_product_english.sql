-- Optional English product title and description. English pages fall back to French when
-- a seller has not written them. Reviewed and copied on approval like the other languages.
ALTER TABLE catalog.product_submissions
  ADD COLUMN title_en text CHECK (title_en IS NULL OR char_length(btrim(title_en)) BETWEEN 1 AND 500),
  ADD COLUMN description_en text
    CHECK (description_en IS NULL OR char_length(btrim(description_en)) BETWEEN 1 AND 8000);

ALTER TABLE catalog.products
  ADD COLUMN title_en text CHECK (title_en IS NULL OR char_length(btrim(title_en)) BETWEEN 1 AND 500),
  ADD COLUMN description_en text
    CHECK (description_en IS NULL OR char_length(btrim(description_en)) BETWEEN 1 AND 8000);
