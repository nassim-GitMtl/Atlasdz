# Atlas DZ Customer Web Prototype

This is the connected Customer Web prototype for Product Design direction 2, **“Mobile Bazaar,”** selected by the project owner on 2026-10-02. It validates the visual system, responsive behavior, French/Arabic directionality, and the core customer purchase journey before production implementation.

## Scope

- Faithful desktop composition based on `docs/design-reference-mobile-bazaar.png`.
- Responsive layouts down to 320 px.
- French LTR and Arabic RTL presentation.
- Connected home, search, category, product, seller-offer, cart, COD checkout, confirmation, order-history, order-detail, account, help, returns, and privacy routes.
- Keyboard-operable search suggestions, filters, sorting, quantity controls, checkout selections, consent, and back/forward navigation.
- Delivery-location selection, cart feedback, loading, empty, error, offline, unavailable-product, and truthful shipment-timeline states.
- Refresh-safe synthetic cart, language, location, checkout, confirmation, and newly placed demo-order state using browser-local storage.
- Original generated imagery stored in `public/assets/`.

`atlas dz` is a provisional working identity. The connected journey uses synthetic catalog, address, shipping, COD, and order data in the browser. It has no production backend integration, authentication gate, real payment processing, order service, seller tooling, courier integration, or live inventory. Those capabilities remain governed by the Phase 0 architecture package in [`../../docs/phase-0`](../../docs/phase-0/README.md).

## Test the customer journey

1. Use a popular search or category on the home screen.
2. Open a product and optionally select another seller offer.
3. Add it to the cart and choose **Passer au paiement**.
4. Continue through address, shipping, COD payment, and review.
5. Accept the review checkbox and confirm the synthetic order.
6. Open tracking, then refresh the page to verify the demo order remains available.
7. Switch to Arabic at any point to verify the same route in RTL.

## Run locally

```bash
pnpm install
pnpm dev
```

The development server defaults to `http://localhost:5173`. Use `?state=empty` or `?state=error` on the home route to inspect alternate merchandising states.

## Verify

```bash
pnpm test
pnpm build
pnpm test:sites
```

The build prepares both the static client and the Sites-compatible worker bundle. Publishing is intentionally out of scope until explicitly requested.

## Design record

- Source visual: `docs/design-reference-mobile-bazaar.png`
- Implementation QA: `design-qa.md`
- Durable prototype decisions: `AGENTS.md`
