# Original Product Design System Specification

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

## Status and visual approval rule

This document defines the system constraints, not a finished visual direction. The final brand name, logo, palette, imagery, and component styling require a separate three-direction visual exploration and explicit selection before UI implementation. No Amazon, Jumia, Noon, Walmart, or other marketplace identity may be copied.

Working codename: **Project Atlas DZ**. It is not a customer-facing brand and requires trademark/domain clearance if promoted.

## Brand principles

1. **Local confidence:** unmistakably useful in Algeria without decorative clichés or flag-colored overload.
2. **Price clarity:** totals, fees, seller, delivery, warranty, and return status are visually explicit.
3. **Operational truth:** badges and promises are driven by actual verification and SLA state.
4. **Calm density:** shopping is approachable; internal consoles are information-dense but never ambiguous.
5. **Bilingual equality:** Arabic is designed, not retrofitted; French is not the hidden default.
6. **Resilient commerce:** low bandwidth, empty/error/offline states, and recovery actions are first-class.

## Token architecture

Tokens use semantic names and modes rather than page-specific hex values.

- Color primitives: neutral ramp; one selected primary ramp; one secondary ramp; accent ramp.
- Semantic colors: `surface`, `surface-subtle`, `text`, `text-muted`, `border`, `focus`, `action`, `success`, `warning`, `danger`, `info`, each with contrast-safe variants.
- Commerce semantics: `price-current`, `price-previous`, `discount`, `stock-available`, `stock-limited`, `trust-verified`, `fulfillment-marketplace`.
- Spacing: 4 px base with named scale; logical inline/block tokens.
- Radius: small/medium/large plus pill; avoid universal excessive rounding.
- Elevation: base/raised/overlay; shadows used only when structure cannot communicate elevation.
- Typography: Arabic- and Latin-compatible families with matched x-height/weight behavior, maximum two families, local/system fallbacks, font-subsetting strategy.
- Motion: fast/standard/slow tokens, reduced-motion mode, no motion required to understand state.
- Breakpoints: content-driven support for 320, 360, 390, tablet, laptop, desktop, large monitor.
- Z-index and overlay layers: content, sticky, dropdown, modal, toast; centrally controlled.

The final color and type values are chosen after visual ideation and contrast testing. Code consumes tokens through CSS custom properties/native theme objects; raw brand values are lint-restricted outside token sources.

## Bidirectional design rules

- Set `lang` and `dir` at root; nested mixed-language content uses explicit language/bidi isolation.
- Use `margin-inline`, `padding-inline`, `inset-inline`, start/end alignment, and direction-aware grids.
- Mirror chevrons, progressions, drawers, carousels, and back/forward actions; do not mirror universal symbols, numbers, brand marks, media playback, or maps blindly.
- Preserve phone numbers, order IDs, SKUs, serials, tracking codes, URLs, and currency values with bidi isolation.
- Tables keep numeric alignment deliberate; column order may mirror only after task testing.
- Arabic line height, glyph clipping, weight, and truncation receive visual regression coverage.
- Search accepts Arabic/French and presents cross-language results without changing stored identifiers.

## Component families

### Foundations

Typography, iconography from a licensed maintained library, responsive grid, focus ring, dividers, surfaces, localized number/money/date/address presentation, and real generated/licensed imagery. No emoji, ASCII, CSS drawings, or fake image placeholders as final visible assets.

### Actions and input

Button, icon button, link, segmented control, checkbox, radio, switch, text field, password field, phone field with Algeria validation, OTP input, search/autocomplete, select/combobox, wilaya/commune picker, quantity stepper, date range, file upload with progress/scan state, and rich-text field for controlled CMS use.

Every input defines label, hint, required/optional indicator, validation, disabled/read-only, loading, success, warning, error, keyboard, screen-reader, and RTL behavior.

### Navigation

Customer header, category navigation, account navigation, bottom navigation, breadcrumbs, tabs, pagination, back link, locale selector, delivery-location selector; internal app sidebar, command/search, workspace switcher, and permission-aware action bar.

### Commerce

Product tile/list row, price, promotion, rating summary, verified review, offer comparison, seller identity/trust, fulfillment badge, stock state, delivery estimate, variant selector, gallery, cart line/group, order summary, policy disclosure, shipment timeline, return/refund status, and settlement/ledger row.

### Feedback and state

Inline validation, banner, alert, toast, modal, drawer, confirmation with consequence, stepper, progress, skeleton, empty state, recoverable error, offline state, permission-denied state, maintenance state, and provider-delayed state.

### Data and operations

Table, virtualized list, filter bar, saved view, bulk-selection/action guard, KPI, trend chart, state badge, activity/audit timeline, diff view, evidence viewer, reconciliation comparison, queue, assignment control, map/list route, scan input, label/document preview.

## Content design

- Source strings use stable translation keys with ICU-style plural/select handling; never concatenate translated fragments.
- Buttons describe the action (`Confirm order`, `Submit return`) rather than generic `OK`.
- Destructive and financial confirmations name amount/entity, consequence, reversibility, and required reason.
- Customer errors are actionable and localized; correlation IDs are available for support without exposing internals.
- Delivery uses honest ranges; verification and authenticity claims appear only from trusted state.
- Policy and consent versions are visible and acceptance records link to the exact content version.

## Accessibility acceptance

- WCAG 2.2 AA target; 4.5:1 normal text and 3:1 large/UI graphical objects unless an approved exception applies.
- Full keyboard operation and visible focus for web; logical focus order after direction changes.
- Minimum practical target sizes, semantic landmarks/headings, labels and descriptions, accessible dialogs, and non-color status cues.
- Live regions only for meaningful asynchronous changes; reduced motion; zoom/reflow tests; screen-reader tests in Arabic and French for critical flows.

## Required component evidence before build approval

The chosen visual direction must show at least: customer homepage, product/offer detail, cart/checkout review, order tracking, Seller Center dashboard/product flow, Admin moderation queue, and one mobile/RTL state. A compact design-token sheet and representative loading/empty/error/offline states must accompany it.

## Governance

- Components have owner, status, API, accessibility notes, RTL notes, content rules, analytics hooks, and visual tests.
- Changes follow proposal → design review → accessibility/localization review → implementation → visual regression → release notes.
- Feature teams may compose components but cannot fork core tokens or trust/status semantics without design-system review.
