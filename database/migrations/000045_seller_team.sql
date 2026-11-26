-- Seller teams: the owner invites staff who handle orders, delivery, support and customer
-- questions, but cannot change offers, products, delivery prices, legal identity or the team.
INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('seller.team.manage', 'SENSITIVE', 'Invite and remove team members of the authenticated seller');

INSERT INTO identity.roles (code, actor_type, assignment_scope_type, status, is_system, description) VALUES
  ('SELLER_STAFF', 'seller_user', 'SELLER', 'ACTIVE', true, 'Team member of one seller account');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('SELLER_OWNER', 'seller.team.manage'),
  ('SELLER_STAFF', 'offer.read'),
  ('SELLER_STAFF', 'order.read'),
  ('SELLER_STAFF', 'order.process'),
  ('SELLER_STAFF', 'order.reject'),
  ('SELLER_STAFF', 'delivery.read'),
  ('SELLER_STAFF', 'support.manage'),
  ('SELLER_STAFF', 'review.reply')
) AS grants(role_code, permission_code)
JOIN identity.roles r ON r.code = grants.role_code
JOIN identity.permissions p ON p.code = grants.permission_code;
