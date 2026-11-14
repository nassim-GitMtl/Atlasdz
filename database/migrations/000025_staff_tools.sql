-- Staff tooling: category management and seller suspension.
INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('catalog.manage', 'SENSITIVE', 'Manage categories and remove product photos (global staff)'),
  ('seller.manage', 'SENSITIVE', 'Suspend or reinstate sellers (global staff)'),
  ('marketplace.dashboard', 'STANDARD', 'Read marketplace operating metrics (global staff)');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r
JOIN identity.permissions p ON p.code IN ('catalog.manage', 'seller.manage', 'marketplace.dashboard')
WHERE r.code = 'MARKETPLACE_STAFF';

ALTER TABLE sellers.sellers ADD COLUMN suspended_reason text
  CHECK (suspended_reason IS NULL OR char_length(btrim(suspended_reason)) BETWEEN 1 AND 1000);
