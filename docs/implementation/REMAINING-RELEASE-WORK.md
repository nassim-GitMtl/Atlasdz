# Current release follow-up — 2026-11-15

Baseline: `23aa5ad`. This supplements the older production-readiness ledger, whose historical
entries are not a current feature inventory. Do not repeat completed redesign or English work.

## Completed in the current working tree

- Native customer cart groups items and subtotals by seller.
- Wilaya/commune selection previews one shipping charge per seller using the existing public
  fee API. Explicit zero fees are supported; unknown, malformed, failed or unsupported rates
  never become free delivery.
- Estimates are invalidated by cart/destination changes, refresh and expiry. Late responses
  cannot overwrite another destination. The selected commune carries into checkout.
- Any unavailable/short-stock item blocks checkout until corrected. Server quotes still
  revalidate inventory, promotions, fees and preorder consent; no order rules were weakened.
- French, Arabic RTL and English labels. No database migration or production switch changed.

## Evidence from this phase

- Mobile TypeScript and Expo lint: passed.
- Mobile unit suite: 47/47 passed (7 new delivery regressions).
- Expo web export: passed.
- Isolated browser shipping journeys: 3/3 locales passed with mocked API data; includes seller
  totals, zero/unsupported rates, failed refresh, destination carry-over, stale-response
  rejection, overflow and uncaught JavaScript checks.
- Checkout re-shows each seller's fee for the chosen commune (shared fee hook) and blocks a
  commune a seller does not serve. Live-API mobile journey: 20/20 against the local API.
- This is not real-device certification.

## Product photo galleries (done, migration 000034)

- Up to 7 extra photos after the main one. The submitting seller adds, removes or promotes one
  to main photo (Seller Center and app); staff take any down by its address (files deleted).
- Shown as thumbnails on the shop product page and the app product screen; the single-photo
  API and old clients keep working (`gallery` is optional).
- Evidence: API integration 22/22 (limits, ownership, cover swap, takedown, file deletion);
  tools/testing/browser/gallery.mjs 7/7 on the local stack; e2e 15/15, mobile-app 20/20,
  mobile-seller 11/11. Not yet run in the production rehearsal.

## Remaining implementation

1. Structured specifications: seller authoring, review, publication and multilingual display.
2. Native push: permission UX, device ownership/revocation, outbox integration, retries,
   receipts/invalid-token cleanup and authorized deep links.

## Release gates

- Owner-provided production VPS/domain/SMTP and approved legal facts; never fabricate approval.
- `mobile/eas.json` still uses `https://your-shop-domain.example` in both profiles.
  Real configuration, credentials, a signed build and store submission are pending.
- Validate changes on physical devices and against the real test API.
- Reuse the existing release/rehearsal kit. Confirm backup restore, monitoring, rollback and
  production secrets in the target environment before authorizing launch.
- Public deployment, live checkout activation and store publication require explicit approval.

The historical checkpoint records a successful local production rehearsal. That is not evidence
that a public commercial deployment is running, or that the new mobile work is device-certified.
