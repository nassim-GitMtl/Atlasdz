# Browser end-to-end and accessibility checks

Drives the real local apps (customer 3001, Seller Center 3002, API 3003) in headless Chromium at
phone width: customer signup → email verification → account → legal pages → password reset →
guest checkout (email only, then the set-password link) → rating a delivered item on the order
page → cart without an account (email asked at checkout) → pre-order bought with the accepted
delay; seller signup → authenticator enrollment → staff approval → admin page.
`ATLAS_E2E_SHOP_ONLY=1` stops before Seller Center (agent browser access to it needs approval). Every page is scanned
with axe (WCAG 2 A/AA) and checked for horizontal scrolling.

```sh
# 1. Start the local stack as in docs/implementation/LOCAL-TESTING.md, with the API log in a file:
ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true node --env-file=../../.env.local \
  dist/local-main.js > /tmp/atlas-local-api.log 2>&1   # from apps/api
# 2. In a scratch directory outside the repo:
npm i playwright@1.56.1 @axe-core/playwright@4.10.2 && npx playwright install chromium
cp /path/to/repo/tools/testing/browser/e2e.mjs . && ATLAS_API_LOG=/tmp/atlas-local-api.log node e2e.mjs
```

Result on 2026-11-15 (shop only): 10/10 pass, 0 accessibility/layout findings. The API allows 20
sign-ups per hour per address: restart the local API between many runs.

## Installable app (PWA) check

`pwa.mjs` checks both apps as installable phone apps under the production CSP: manifest and
icons, service worker in control, Chrome's installability check, the French/Arabic offline page
and the iPhone "Add to Home Screen" steps (with an axe scan). Same setup as above, then:

```sh
cp /path/to/repo/tools/testing/browser/pwa.mjs . && node pwa.mjs
```

Result on 2026-11-13: 10/10 checks pass for the shop and Seller Center.

## Android app journey (mobile/)

`mobile-app.mjs` drives the app's web build at phone size against the local API: browse, search,
sign-in prompt, registration, cart, account and Arabic switch, favorites, recently viewed and the
seller's shop page, then, as the local demo customer (local checkout is limited to it): checkout
→ order → help request with a seller reply → reorder → cancel → orders list, a second order
delivered through the seller API and rated in the app (then read on the product page), similar
products, saved address, connected devices and notifications. Both journeys restock the demo
seller's offers first (repeated runs use stock up); the seller journey leaves one offer at 2 so
the dashboard's stock alert shows. It gives the local demo seller one synthetic delivery
destination if it has none.

`mobile-seller.mjs` runs seller mode as the local demo seller: dashboard after a restart in
seller mode; an order (placed by the demo customer through the API) accepted → prepared →
shipped with a tracking number → delivered; a reply to the customer's review; order search, the delivery slip, the sales chart
(after the customer confirms receipt) and the stock alert; the customer's question answered; an offer edited;
a new product submitted (with characteristics and an English title), approved through the local
staff session, given a main and an extra photo from the file picker and an offer, then shown with
its characteristics in French and English; a commune delivery rate; notifications; sign-out.

`gallery.mjs` (same stack, plus Seller Center on 3002): a seller adds extra photos in Seller
Center, makes one the main photo and removes another; shop and app thumbnails switch the large
photo; a staff account made with `create-staff` takes down an extra photo by its address.

```sh
# API with the app's test origin allowed (apps/api)
ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true \
  CORS_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://127.0.0.1:8090 \
  node --env-file=../../.env.local dist/local-main.js
# In mobile/ (Node 24): web build of the app, served with a single-page fallback on 8090
EXPO_PUBLIC_API_URL=http://127.0.0.1:3003 EXPO_PUBLIC_SHOP_URL=http://127.0.0.1:3001 \
  npx expo export --platform web --output-dir dist/web
npx serve -s dist/web -l 8090
# In the scratch directory with Playwright
cp /path/to/repo/tools/testing/browser/mobile-{app,seller}.mjs .
node mobile-app.mjs && node mobile-seller.mjs
```

Result on 2026-11-18: customer 20/20, seller 12/12, gallery 7/7. On 2026-11-15: customer 20/20
(cart without account, pre-order) and seller 11/11,
0 accessibility findings. The
only HTTP error is a 404 on `/api/v1/account` for the demo customer, which has no email account.
