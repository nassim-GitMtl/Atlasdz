# Atlas DZ checkpoint — 2026-11-14

- State: launch-ready behind owner switches (live COD needs `ATLAS_LIVE_CHECKOUT`,
  `ATLAS_LEGAL_REVIEWED`, legal facts, SMTP). Migrations 000001–000027 (checksum-locked).
- Apps: shop + Seller Center (web/PWA), Expo app in mobile/ (customer + seller modes,
  reviews, seller tools). Guest checkout (11-14): `POST /api/v1/auth/register/guest`, 7-day
  set-password link; unconfirmed email = 1 open order. E2E: e2e.mjs shop 8/8,
  mobile-app.mjs 18/18, mobile-seller.mjs 10/10.
- Resume: pnpm via `npx -y pnpm@11.19.0 --dir <repo>` from outside the repo; Expo needs Node 24;
  local stack per docs/implementation/LOCAL-TESTING.md.
- Remaining: owner legal/VPS/domain/SMTP; EAS build → Play; push, multi-photo, returns,
  review notifications.
