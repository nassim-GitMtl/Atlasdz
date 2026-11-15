-- Staff can open any seller or customer account, close (delete) accounts and remove offers,
-- products and reviews. Orders and audit history stay as commercial records; closed accounts
-- are pseudonymized and can no longer sign in.
INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('account.manage', 'SENSITIVE',
   'View and close any seller or customer account; remove offers, products and reviews (global staff)');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r
JOIN identity.permissions p ON p.code = 'account.manage'
WHERE r.code = 'MARKETPLACE_STAFF';

-- A closed seller stays SUSPENDED for good (it cannot be reinstated).
ALTER TABLE sellers.sellers ADD COLUMN closed_at timestamptz;
