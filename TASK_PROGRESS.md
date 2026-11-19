# Atlas DZ checkpoint — 2026-11-15

- State: redesign A–E done. Deployed-mode verified on a local production rehearsal (release
  images + vps/compose.vps.yml + TLS via Caddy on shop.localhost / vendeur.localhost + Mailpit,
  live COD on): tools/testing/browser/deployed-journey.mjs 23/23. Migrations 000001–000036.
- Added today: offer refusal with reason + seller emails (000030); delivery fee per seller for a
  commune before checkout (GET /api/v1/delivery/fees); seller promotions (000031); staff account
  powers: vendor/customer accounts, remove offers/products/reviews, close accounts (000032,
  account.manage); Seller Center reviews replies + orders CSV. English (3rd language) in shop,
  Seller Center, app and emails; product texts fall back to French; categories have optional
  English names (000033).
- Tests: API 74 unit + 22 integration; e2e.mjs 15/15; mobile-app 20/20; mobile-seller 11/11.
  Local checkout only for the demo customer; restart API if 429 on /local/session.
- Rehearsal kit (scratch, not in repo): atlas.sh wrapper, atlas-home secrets, rehearsal.yml.
- Mobile cart: grouped by seller, commune fee previews (expiry/stale-safe), unavailable items
  block checkout, commune carries into checkout, which re-shows each seller's fee and blocks
  unsupported communes. mobile-app 20/20 (live API), mobile-delivery 3/3 (mocked), 47 unit.
- Photo galleries (000034): 7 extra photos per product, seller add/remove/main, staff takedown;
  shop + app thumbnails. gallery.mjs 7/7; API integration 22/22.
- Product characteristics (000035): 11 seller-stated attributes, reviewed with the product;
  shop + app display. mobile-seller 12/12, e2e 15/15, mobile-app 20/20.
- English product texts (000036): optional title/description, reviewed; English pages and search.
- Rehearsal 2026-11-18: migrations 34–36 applied on existing data; deployed-journey 23/23.
- 11-19: price range filter (API, shop, app panel with stock toggle); schema.org Product data
  (real ratings only) + sitemap with categories/stores/fr-ar-en; app language radios a11y fix.
- Seller Center quick update (/offers/quick): price + stock of many offers, version-checked.
- Remaining: real server deploy (owner: VPS/domain/SMTP/legal), signed EAS build → Play,
  push notifications. See docs/implementation/REMAINING-RELEASE-WORK.md.
