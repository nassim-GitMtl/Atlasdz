INSERT INTO identity.permissions (code, sensitivity, description) VALUES
  ('offer.create', 'SENSITIVE', 'Create an offer within the authenticated approved seller scope'),
  ('offer.approve', 'SENSITIVE', 'Approve a pending seller offer for public discovery'),
  ('offer.read', 'STANDARD', 'Read offers within the authenticated seller scope');
