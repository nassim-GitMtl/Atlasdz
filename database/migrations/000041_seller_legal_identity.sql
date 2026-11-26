-- Seller legal identity (Algerian e-commerce law 18-05): every e-supplier shows its register
-- number (commerce, craft or auto-entrepreneur), tax number (NIF), physical address, phone
-- and email. Required at registration from now on; older sellers complete it from Seller Center.
ALTER TABLE sellers.sellers
  ADD COLUMN legal_name text CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 2 AND 160),
  ADD COLUMN register_kind text COLLATE "C"
    CHECK (register_kind IS NULL OR register_kind IN ('COMMERCE', 'ARTISAN', 'AUTO_ENTREPRENEUR')),
  ADD COLUMN register_number text CHECK (register_number IS NULL OR char_length(btrim(register_number)) BETWEEN 3 AND 40),
  ADD COLUMN tax_id text COLLATE "C" CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{15,20}$'),
  ADD COLUMN legal_address text CHECK (legal_address IS NULL OR char_length(btrim(legal_address)) BETWEEN 5 AND 240),
  ADD COLUMN contact_phone text COLLATE "C" CHECK (contact_phone IS NULL OR contact_phone ~ '^\+?[0-9]{9,15}$'),
  ADD COLUMN contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) BETWEEN 6 AND 254);
