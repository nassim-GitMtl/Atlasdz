-- Extra product photos shown after the cover (catalog.products.image_url), at most 7 per
-- product. Removed photos keep their row for the audit trail; their files are deleted.
ALTER TABLE catalog.product_media
  ADD COLUMN in_gallery boolean NOT NULL DEFAULT false,
  ADD COLUMN removed_at timestamptz,
  ADD CONSTRAINT product_media_gallery_live CHECK (NOT (in_gallery AND removed_at IS NOT NULL));

CREATE INDEX product_media_gallery_idx ON catalog.product_media (product_id, created_at, id)
  WHERE in_gallery;
