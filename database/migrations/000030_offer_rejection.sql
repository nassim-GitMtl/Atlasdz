-- Staff can refuse an offer with a reason the seller sees. A refused offer that the seller edits
-- goes back to review and loses the reason. Older refused rows keep a null reason.
ALTER TABLE offers.offers
  ADD COLUMN rejection_reason text,
  ADD CONSTRAINT offers_rejection_reason_shape CHECK (
    rejection_reason IS NULL
    OR (status = 'REJECTED' AND char_length(btrim(rejection_reason)) BETWEEN 5 AND 300)
  );
