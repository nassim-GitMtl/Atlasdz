# Design QA — Mobile Bazaar Connected Customer Flow

Date: 2026-10-05  
Source visual truth: `docs/design-reference-mobile-bazaar.png`  
Implementation: `http://localhost:4173/`

## Findings

- No actionable P0, P1, or P2 visual, responsive, interaction, or accessibility findings remain within the connected prototype scope.
- The implementation uses the project's original raster asset set rather than placeholders, CSS art, handcrafted SVG art, or emoji. The generated product scenes vary from the reference pixels but preserve its subjects, crop intent, palette, density, and merchandising direction; this is an accepted asset-set variation rather than an unresolved fidelity issue.
- App copy intentionally avoids unimplemented production claims such as real-time courier tracking. This produces small text differences from the source while preserving the same hierarchy and card geometry.

## Comparison setup

| Evidence                     | Path                                                         | Pixels / CSS viewport     | State                                                           |
| ---------------------------- | ------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------- |
| Source                       | `docs/design-reference-mobile-bazaar.png`                    | 1487 × 1058               | Approved French desktop home                                    |
| Final implementation         | `docs/design-qa-home-desktop-final-1487x1058.jpg`            | 1487 × 1058 / 1487 × 1058 | French desktop home, empty cart                                 |
| Full side-by-side comparison | `docs/design-qa-home-comparison-final.jpg`                   | 2998 × 1116               | Source and implementation placed together without resampling    |
| Focused deals comparison     | `docs/design-qa-deals-comparison-final.jpg`                  | 2998 × 408                | Deal cards, delivery rows, trust panel, and next-section timing |
| Arabic mobile category       | `docs/design-qa-category-arabic-mobile-viewport-390x844.jpg` | 390 × 844 / 390 × 844     | Arabic RTL category with filters and two-column catalog         |
| Arabic mobile product        | `docs/design-qa-product-arabic-mobile-390x844.jpg`           | 390 × 844 / 390 × 844     | Arabic RTL product detail                                       |

Desktop and mobile captures used explicit browser viewport overrides and produced equal screenshot and CSS viewport dimensions. No density normalization or image resampling was required. Temporary viewport overrides were reset after QA.

## Full-view comparison evidence

`docs/design-qa-home-comparison-final.jpg` places the source and browser capture in one comparison image. It verifies the same header/category rhythm, hero-to-utility proportion, deal/trust row, warm canvas, turquoise/coral/navy token balance, rounded surface language, and above-the-fold entry into “Pour la maison.”

The source and implementation use the same Manrope-led optical hierarchy. Arabic uses Noto Sans Arabic and true document-level RTL. The current asset variants remain sharp at their rendered crops and retain the image-led visual weight of the reference.

## Focused-region comparison evidence

`docs/design-qa-deals-comparison-final.jpg` preserves the readable deal-card region at full source width. It verifies image-left/detail-right anatomy, product title, rating, current and old prices, seller, stock, delivery estimate, bottom action, trust-panel alignment, radii, borders, and vertical rhythm. Additional full-screen captures validate route-specific components:

- Search: `docs/design-qa-search-desktop-1487x1058.jpg`
- Product and seller offers: `docs/design-qa-product-desktop-1487x1058.jpg`
- Seller-grouped cart: `docs/design-qa-cart-desktop-1487x1058.jpg`
- Address: `docs/design-qa-checkout-address-desktop-1487x1058.jpg`
- COD payment: `docs/design-qa-checkout-payment-desktop-1487x1058.jpg`
- Review: `docs/design-qa-checkout-review-desktop-1487x1058.jpg`
- Confirmation: `docs/design-qa-confirmation-desktop-1487x1058.jpg`
- Truthful order timeline: `docs/design-qa-order-detail-states-desktop-1487x1058.jpg`

## Required fidelity surfaces

- Fonts and typography: Manrope Variable matches the reference's dense commerce hierarchy; Noto Sans Arabic provides legible localized shaping. Weights, line heights, wrapping, price emphasis, small metadata, and mixed-direction order references were checked at desktop and mobile sizes.
- Spacing and layout rhythm: matched 1487 × 1058 composition, page margins, header height, category rail, hero/utility tracks, deal row, card gaps, rounded corners, and home-section timing. Checkout and order screens retain a narrower task-focused measure.
- Colors and visual tokens: warm sand canvas, deep navy type/footer, turquoise actions, coral primary emphasis, blue support surfaces, status green, border, and shadow tokens remain consistent. Disabled electronic payment and future tracking states are visually distinct.
- Image quality and asset fidelity: every visible image is a real local raster asset with a non-zero render size, appropriate crop, and no transparency halo, stretch, CSS substitute, or placeholder treatment.
- Copy and content: French and Arabic app copy is coherent in isolation, synthetic data is explicit, COD is the only enabled payment route, and unverified real-world delivery/payment claims are avoided.
- Icons and affordances: Phosphor icons use one stroke family; icon-only account actions have accessible names, gallery thumbnails have labels, focus indicators remain visible, and directional arrows mirror in RTL.
- Viewport resilience: 1487 × 1058 desktop and 390 × 844 mobile/RTL captures show no overlapping persistent controls or clipped core actions. Horizontal merchandising/filter rails remain intentional and contained.

## Primary interactions tested

- Popular search → results → product detail.
- Seller-offer selection → add to cart; the alternate seller and price persist into the seller-grouped cart.
- Cart → address → shipping → COD payment → review consent → confirmation.
- Confirmation → order tracking; both confirmation and newly placed demo-order detail survive a full page reload.
- Orders, account, category, help, returns, privacy, locale switching, browser back/forward, and deep-linked routes.
- Arabic category and product screens at 390 × 844 with document `lang="ar"` and `dir="rtl"`.
- A fresh end-to-end browser session completed with no console warnings or errors.

## Comparison history

1. 2026-10-02 — P1 hero height and P1 stacked deal-card anatomy drifted from the selected source; P2 header/category offsets and section timing also drifted. The hero grid, desktop cards, header rhythm, and section sizing were corrected and re-captured.
2. 2026-10-05 pass 1 — P2: reusing the browse catalog card made the connected homepage deal row too tall and pushed “Pour la maison” below the reference viewport. A desktop-only compact deal-card composition restored the reference row height. Evidence: `docs/design-qa-home-comparison.jpg` before and `docs/design-qa-home-comparison-pass2.jpg` after.
3. 2026-10-05 pass 2 — P2: the compact cards omitted the delivery-estimate row visible in the source. The row was restored without changing the 250 px card rhythm. Post-fix evidence: `docs/design-qa-home-comparison-final.jpg` and `docs/design-qa-deals-comparison-final.jpg`.
4. 2026-10-05 flow pass — P2: future shipment events used completed checkmarks. Upcoming events now use neutral clock states while the current confirmed event keeps coral emphasis. Before: `docs/design-qa-order-detail-desktop-1487x1058.jpg`; after: `docs/design-qa-order-detail-states-desktop-1487x1058.jpg`.
5. 2026-10-05 interaction pass — P1: a newly placed demo order disappeared after refresh. Cart, checkout, locale, location, confirmation, and synthetic order state now persist locally; unit and fresh-browser reload checks pass.
6. 2026-10-05 accessibility pass — P2: compact account icons and product-gallery thumbnails lacked reliable accessible names at narrow widths. Explicit localized labels were added and verified in the accessibility tree.

## Open questions

- Exact launch brand, legal copy, production authentication, authoritative inventory/pricing, COD rules, courier data, and server-side order idempotency remain production-work decisions outside this prototype.
- If the final creative direction requires pixel-identical reference imagery, the approved production asset pack must replace the current high-quality generated variants before implementation sign-off.

## Implementation checklist

- [x] Connected customer routes and primary controls.
- [x] French LTR and Arabic RTL parity.
- [x] Desktop and mobile browser captures.
- [x] Source/implementation full-view and focused-region comparisons.
- [x] Refresh-safe synthetic order journey.
- [x] Automated component/flow and Sites packaging tests.
- [x] Fresh-session console check.

## Follow-up polish

- P3: replace provisional `atlas dz` identity and synthetic creative variants only after brand/legal approval and a final licensed asset pack.

final result: passed
