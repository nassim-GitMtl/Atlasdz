-- Store logo: a square WebP uploaded by the seller (served from /media like product photos).
ALTER TABLE sellers.sellers
  ADD COLUMN logo_url text CHECK (
    logo_url IS NULL
    OR logo_url ~ '^/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
