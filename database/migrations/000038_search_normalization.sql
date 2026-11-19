-- Accent- and spelling-tolerant catalogue search: "cafe" finds "café", and Arabic spellings
-- match whatever hamza/alef form, ya, ta marbuta, diacritics or tatweel the shopper types.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE FUNCTION catalog.search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
    SELECT translate(
      lower(public.unaccent('public.unaccent'::regdictionary, value)),
      'أإآٱىةـًٌٍَُِّْٰ',
      'اااايه'
    )
  $$;
