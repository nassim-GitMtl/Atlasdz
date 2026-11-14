-- Per-number SMS throttling: confirmation codes sent to one phone number across all accounts
-- in the last day (prevents SMS bombing of a third party and bounds gateway costs).
CREATE INDEX phone_verification_codes_phone_idx
  ON identity.phone_verification_codes (phone_e164, created_at DESC);
