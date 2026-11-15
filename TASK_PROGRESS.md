# Atlas DZ checkpoint — 2026-11-15

- State: redesign A–E done. Deployed-mode verified on a local production rehearsal (release
  images + vps/compose.vps.yml + TLS via Caddy on shop.localhost / vendeur.localhost + Mailpit,
  live COD on): tools/testing/browser/deployed-journey.mjs 23/23. Migrations 000001–000032.
- Added today: offer refusal with reason + seller emails (000030); delivery fee per seller for a
  commune before checkout (GET /api/v1/delivery/fees); seller promotions (000031); staff account
  powers: vendor/customer accounts, remove offers/products/reviews, close accounts (000032,
  account.manage); Seller Center reviews replies + orders CSV.
- Tests: API 74 unit + 22 integration; e2e.mjs 15/15; mobile-app 20/20; mobile-seller 11/11.
  Local checkout only for the demo customer; restart API if 429 on /local/session.
- Rehearsal kit (scratch, not in repo): atlas.sh wrapper, atlas-home secrets, rehearsal.yml.
- Remaining: real server deploy (owner: Algerian VPS, .com.dz, SMTP, legal), EAS build → Play,
  push notifications, multi-photo, product specs, fee preview in the app's cart.
