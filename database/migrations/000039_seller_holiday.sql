-- Holiday mode: until this time the seller's offers are hidden and cannot be ordered. They
-- come back on their own when it passes (no job needed). Null: open.
ALTER TABLE sellers.sellers ADD COLUMN holiday_until timestamptz;
