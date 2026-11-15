-- English shop pages: categories can carry an English name (staff-managed). Product texts stay
-- French and Arabic (English pages show the French text).
ALTER TABLE catalog.categories
  ADD COLUMN title_en text CHECK (title_en IS NULL OR char_length(btrim(title_en)) BETWEEN 1 AND 160);

UPDATE catalog.categories SET title_en = names.title_en
FROM (VALUES
  ('mode-vetements', 'Fashion and clothing'),
  ('maison-cuisine', 'Home and kitchen'),
  ('electronique', 'Electronics and accessories'),
  ('beaute-soins', 'Beauty and care'),
  ('enfants-jouets', 'Kids and toys'),
  ('sport-loisirs', 'Sports and leisure'),
  ('artisanat', 'Algerian crafts'),
  ('librairie-papeterie', 'Books and stationery'),
  ('kitchen', 'Kitchen'),
  ('phones', 'Phones'),
  ('beauty', 'Beauty'),
  ('fashion', 'Fashion')
) AS names (slug, title_en)
WHERE catalog.categories.slug = names.slug;
