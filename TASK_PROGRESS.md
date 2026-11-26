# Atlas DZ checkpoint — 2026-11-26

- State: redesign done; FR/AR/EN everywhere. Migrations 000001–000045 (checksum-locked).
- Deployed mode: local production rehearsal (release images, vps compose, Caddy TLS on
  shop.localhost / vendeur.localhost, Mailpit, live COD): deployed-journey.mjs 26/26 + deployed-shop.mjs 5/5 on 11-20.
- Added 11-17…11-19: app cart delivery estimates; photo galleries (034); product
  characteristics (035); English product texts (036); back-in-stock alerts (037) with seller
  waiting counts; accent/Arabic-tolerant search (038); price filter; schema.org product data;
  sitemap; Seller Center + app quick price/stock update; staff audit log; shop favorites page;
  web "order again"; seller holiday mode (039); checkout pre-filled from the last order;
  search suggestions; offers CSV export; staff metrics for holidays/alerts; product Q&A (040);
  seller legal identity, law 18-05 (041); reported listings + staff queue (042); password change while signed in; seller-stated delivery days per destination (043); printable order summary (shop + Seller Center) with the seller legal identity snapshotted at quote time; store logo (044); "delivered to my commune" catalogue filter (shop + app); offers CSV import (price/stock) in Seller Center; optional courier note on the delivery contact; seller teams (045: SELLER_STAFF role, invite/remove).
- Tests: API 74 unit + 22 integration; catalog 15, commerce 42, database 17 integration;
  e2e 15/15; mobile-app 20/20; mobile-seller 12/12; gallery 7/7; app 51 unit.
  Restart the local API if a suite hits 429 on /api/v1/local/session.
- Rehearsal kit lives in the scratchpad (atlas.sh, atlas-home); the OS may clean it: regenerate
  secrets with infra/release/vps/setup.sh (chown lines disabled) and reset role passwords.
- Remaining (owner): real VPS/domain/SMTP/legal, signed EAS build → Play, push notifications.
  See docs/implementation/REMAINING-RELEASE-WORK.md.
