-- LIVE cash-on-delivery orders alongside the existing synthetic LOCAL/TEST orders.
-- The platform never takes custody of goods or cash: the seller (or its courier) delivers and
-- collects payment. Live checkout is additionally gated by ATLAS_LIVE_CHECKOUT at runtime.

ALTER TABLE commerce.checkout_quotes DROP CONSTRAINT checkout_quotes_check;
ALTER TABLE commerce.checkout_quotes ADD CONSTRAINT checkout_quote_snapshot_valid CHECK (
  jsonb_typeof(snapshot) = 'object'
  AND snapshot ?& ARRAY['id', 'cartVersion', 'dataClass', 'paymentArrangement']
  AND snapshot->>'id' = id::text
  AND (snapshot->>'cartVersion')::integer = cart_version
  AND (
    (snapshot->>'dataClass' = 'synthetic' AND snapshot->>'paymentArrangement' = 'TEST_ONLY_NO_PAYMENT')
    OR (snapshot->>'dataClass' = 'live' AND snapshot->>'paymentArrangement' = 'CASH_ON_DELIVERY')
  )
);

ALTER TABLE commerce.orders DROP CONSTRAINT orders_payment_state_check;
ALTER TABLE commerce.orders ADD CONSTRAINT order_payment_state_valid
  CHECK (payment_state IN ('NOT_APPLICABLE_TEST', 'CASH_ON_DELIVERY'));

ALTER TABLE commerce.seller_orders DROP CONSTRAINT seller_order_test_shipment;
ALTER TABLE commerce.seller_orders ADD CONSTRAINT seller_order_shipment_shape CHECK (
  shipment IS NULL OR (
    jsonb_typeof(shipment) = 'object'
    AND shipment ?& ARRAY['method', 'carrier', 'trackingReference']
    AND shipment->>'method' IN ('SELLER_ARRANGED_TEST', 'SELLER_ARRANGED')
  )
);

CREATE INDEX seller_orders_awaiting_deadline_idx ON commerce.seller_orders (acceptance_deadline, id)
  WHERE status = 'AWAITING_SELLER';

-- Starter launch categories (editable by staff later). Restricted goods stay out of STANDARD.
INSERT INTO catalog.categories (slug, title_fr, title_ar, status, moderation_status, restriction_class)
VALUES
  ('mode-vetements', 'Mode et vêtements', 'الأزياء والملابس', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('maison-cuisine', 'Maison et cuisine', 'المنزل والمطبخ', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('electronique', 'Électronique et accessoires', 'الإلكترونيات والملحقات', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('beaute-soins', 'Beauté et soins', 'الجمال والعناية', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('enfants-jouets', 'Enfants et jouets', 'الأطفال والألعاب', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('sport-loisirs', 'Sport et loisirs', 'الرياضة والترفيه', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('artisanat', 'Artisanat algérien', 'الصناعة التقليدية الجزائرية', 'ACTIVE', 'APPROVED', 'STANDARD'),
  ('librairie-papeterie', 'Librairie et papeterie', 'الكتب والقرطاسية', 'ACTIVE', 'APPROVED', 'STANDARD')
ON CONFLICT (slug) DO NOTHING;
