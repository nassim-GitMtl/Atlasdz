# Atlas DZ checkpoint — 2026-11-15

- State: launch-ready behind owner switches (live COD needs `ATLAS_LIVE_CHECKOUT`,
  `ATLAS_LEGAL_REVIEWED`, legal facts, SMTP). Migrations 000001–000029 (checksum-locked).
- Apps: shop + Seller Center (web/PWA), Expo app in mobile/ (customer + seller modes,
  reviews, seller tools). Guest checkout (11-14): `POST /api/v1/auth/register/guest`, 7-day
  set-password link; unconfirmed email = 1 open order. Cart without account (cookie / phone),
  email at checkout. Pre-orders (000028): offer terms, acceptPreorder required on quotes.
  11-15: order emails via outbox + seller reminder (000029); catalogue search paged/sorted
  server-side (+ /catalog/categories); order funnel on staff dashboard.
  E2E: e2e.mjs shop 11/11, mobile-app.mjs 20/20, mobile-seller.mjs 11/11.
- Resume: pnpm via `npx -y pnpm@11.19.0 --dir <repo>` from outside the repo; Expo needs Node 24;
  local stack per docs/implementation/LOCAL-TESTING.md.
- Remaining: owner legal/VPS/domain/SMTP; EAS build → Play; push, multi-photo, returns,
  review notifications, view/search/cart funnel events, prices per commune before checkout.
