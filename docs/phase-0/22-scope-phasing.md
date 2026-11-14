# Scope: Seller-Fulfilled MVP and Later Phases

Current authority: [ADR-011 — Seller-fulfilled marketplace](../decisions/ADR-011-seller-fulfilled-marketplace.md), accepted from the owner's revised instruction on 2026-10-06. This revision supersedes the original hybrid, warehouse, fleet, and unconditional settlement scope. Historical detailed specifications are subordinate to this decision.

## Sequencing principle

Each milestone must complete a customer-to-seller journey with persistence, permissions, failure handling, tests, and browser evidence. Atlas DZ records and routes orders; sellers own their stock and handle packing, shipping, and delivery. Work progresses on safe unblocked capabilities while unresolved commercial decisions keep affected paths disabled.

## MVP — Controlled seller-fulfilled launch

### Launch envelope

- Approved sellers, curated categories, and verified seller delivery coverage for selected launch locations; no unverified nationwide promise.
- Arabic and French responsive Customer Web and Seller Center from 320 px through desktop.
- Marketplace Admin and Support, optionally within one application with separate permissions.
- Seller-owned inventory, platform-managed stock records/reservations, and a centrally controlled catalog.
- COD only under approved seller/provider collection arrangements. Online payment remains disabled until its fund flow and provider are approved.
- Original branding and the selected “Mobile Bazaar” visual direction; no copied marketplace brand assets.

### Customer capability

- Registration/login, verification/recovery, profile, address book, communication preferences, and session security.
- Homepage, categories, search/filter/sort, product details, seller-offer selection, seller storefront/information, wishlist, and eligible product/seller reviews.
- Multi-seller cart and checkout with seller delivery eligibility, per-seller shipping charges, total review, explicit confirmation, and persistent confirmation record.
- Customer order history/details, seller acceptance and shipment progress, cancellation where permitted, return/refund visibility, support, disputes, and required policy/privacy pages.
- Functional navigation and primary actions, responsive accessibility, Arabic RTL/French LTR, loading/empty/validation/unavailable/error/network states.

### Seller capability

- Seller application, required documents, business profile, approval status, privileged authentication, users/permissions where required, and notification preferences.
- Product matching/new-product request, moderated offers, prices, variants, media, quantity, and availability management.
- Seller delivery coverage, shipping charges, and handling times; configurable acceptance deadlines.
- Authoritative order inbox/details; accept/reject with reasons; prepare, dispatch, shipment/tracking/manual delivery updates, and completion evidence.
- Cancellation, physical-return arrangements, remedies, disputes, controlled support interaction, basic sales/order reporting, and performance visibility.

### Marketplace administration and support

- Seller approval/suspension, category and restricted-product policy, listing moderation, and centrally controlled configuration.
- Order investigation, support cases, return/cancellation/dispute oversight, sensitive-data controls, role-based access, and audit history.
- Marketplace reporting and technical monitoring, alerts, DLQs, backups/restoration, incident handling, and controlled data-repair workflows.
- Fee/accounting records only as required by the approved business model; no invented commission, tax, remittance, or payout terms.

### Commerce invariants

- One customer order splits into isolated seller orders with immutable item, seller, price, shipping, address, and policy snapshots.
- Checkout is idempotent; seller-stock reservation is atomic and cannot oversell. Rejection, cancellation, and expiry release reservations under explicit transition rules.
- Seller-order transitions are explicit and authorized. Payment, notification, shipment, and seller acceptance states remain separate.
- Each seller sees only its orders and authorized customer/delivery data. A partial failure or rejection cannot corrupt another seller's order.
- Orders and routing events commit together. Notifications retry safely; seller inbox visibility does not depend on notification success.
- Delivery and refund reports preserve attribution and evidence. Seller-reported delivery is distinguishable from independently confirmed delivery.

### OUT_OF_SCOPE for this release

- Marketplace-owned goods, purchasing/procurement, or wholesale sourcing.
- Marketplace warehouses, receiving, putaway, pick/pack, cycle counts, manifests, warehouse return inspection, and Warehouse Console.
- Marketplace-operated fleet, driver/courier app, route assignment, or fleet/warehouse Operations application.
- Platform custody of goods or COD cash, platform cash remittance, and fulfillment-by-platform.
- Platform wallet, seller payout engine, and complex seller settlement/subledger unless a separately approved platform fund flow requires them.
- Native mobile applications as a launch prerequisite.
- B2B, subscriptions, international/multi-currency trading, autonomous fraud rejection, ML-dependent personalization, and open seller category creation.

The exclusions above are not missing launch work. Existing reusable designs and code are preserved, but excluded surfaces stay inactive and do not appear as functioning MVP features.

## Phase 2 — Optional expansion of the same model

- Native apps if separately prioritized and funded.
- Certified direct-to-seller or other explicitly approved online payment paths.
- Wider seller delivery coverage, seller-provider integrations, and richer shipment visibility under approved arrangements.
- Controlled customer–seller messaging with moderation and privacy controls.
- Back-in-stock/price alerts, richer Q&A, merchandising, seller insights, bulk offer feeds, and localized content improvements.
- Additional language support if validated by demand.

No Phase 2 feature is a launch blocker. Each addition requires a defined owner, measurable value, policy/security review where applicable, tests, and operational support.

## Phase 3 — Measured scale

- Search/recommendation improvements with privacy controls, explainable measurement, and fallback behavior.
- Service extraction only when actual scale or ownership requires it.
- Governed analytics, catalog quality automation, stronger seller-performance tooling, and capacity planning.
- New countries, currencies, B2B, platform fulfillment, warehouses, fleets, or platform funds custody require a separate business-model decision; none is preapproved by this roadmap.

## Milestone gates

| Milestone                    | Exit evidence                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation                   | Identity, permissions, migrations, contracts, audit, and durable outbox verified for the applicable scope                                        |
| Seller offer → discovery     | Approved seller creates/modifies an offer; moderation, stock, price, and customer discovery work persistently                                    |
| Checkout → seller inbox      | Correct shipping totals, atomic order/reservations, durable routing, idempotency, isolation, and notification-failure tests pass                 |
| Seller processing → tracking | Accept/reject, prepare, dispatch, attributed delivery, failure paths, reservation release, and customer progress verified                        |
| Customer remedies            | Cancellation, return, evidence, support, dispute, and payment-specific refund responsibilities verified                                          |
| Marketplace oversight        | Seller/listing moderation, order investigation, access control, audit, and policy configuration verified                                         |
| Technical deployment         | Applicable builds/tests, migrations, environment validation, backup restore, rollback, monitoring, and deployment package verified               |
| Controlled staging/pilot     | Production-like customer-to-seller rehearsal, selected cohort/coverage, responsible operators, and required environment approvals                |
| Commercial release           | Applicable legal/privacy/tax/seller/delivery/payment/security review and launch authorization recorded; measured pilot evidence supports rollout |

## Readiness and change control

The [readiness ledger](../implementation/PRODUCTION-READINESS.md) reports three evidence-based conclusions: technically deployable, controlled staging/pilot ready, and commercial production ready. A passing prototype or test adapter cannot prove a production path.

Scope changes must record their owner, purpose, responsibility/fund-flow changes, implementation, verification, and operational effect. Correctness, seller isolation, accessibility, security, and applicable professional approvals remain required. A scope exclusion is never evidence that those controls have passed.
