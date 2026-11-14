# Customer Journey Map

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

## Persona set

- **Mobile COD shopper:** variable network, Arabic or French, wants predictable total and delivery.
- **Comparison shopper:** evaluates product, variants, sellers, warranty, reviews, and arrival date.
- **Returning customer:** expects fast re-order, saved address, trusted payment, and clear tracking.
- **Assisted customer:** needs accessible UX, support intervention, or recovery after delivery/payment failure.

## Journey 1 — Discover and compare

| Stage            | Customer action                                         | System responsibility                                                                  | Evidence/metric                             | Recovery                                                 |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Locale/location  | Chooses Arabic/French and wilaya/commune                | Set locale/direction, serviceability context, consent-safe preference                  | locale_selected, location_selected          | Browse without precise location; explain estimate limits |
| Search/browse    | Types Arabic/French query or opens category             | Normalize query, autocomplete products/categories/brands/stores, typo/synonym handling | search, results count, latency, zero result | Suggestions, category fallback, correction control       |
| Evaluate product | Reviews media, specifications, variants, trust, returns | Present master product accurately and isolate offer-specific facts                     | product_view, variant_select                | Missing-data warning; report listing                     |
| Compare offers   | Compares price, seller, fulfillment, warranty, estimate | Rank transparently, never imply verification without state                             | offer_view/select                           | Explain unavailable/non-serviceable offer                |
| Commit           | Adds selected SKU/offer                                 | Validate saleability, price and serviceability; do not reserve permanently             | add_to_cart                                 | Substitute/other offer; preserve cart intent             |

Acceptance: Arabic search and layout are usable end-to-end; no seller or price ambiguity; total/trust claims originate from current data.

## Journey 2 — Multi-seller COD checkout

1. Customer opens cart; platform groups lines by seller/fulfillment owner and revalidates price, availability, limits, promotions, and address serviceability.
2. Customer signs in/registers if needed and verifies phone.
3. Customer selects/creates an Algeria address using wilaya → commune validation.
4. Shipping orchestration groups lines and returns supported home/pickup choices, fee, and honest date range per group.
5. Customer chooses COD. Risk engine returns accepted, verification required, manual review, or rejected with auditable reason codes.
6. If required, customer completes OTP or receives a clear pending-verification state; repeated clicks reuse the same idempotency key.
7. Review shows product/variant/offer/seller, quantity, item price, discount funding, taxes, delivery fee, total, address, phone, method, warranty/return, terms/version, and split-delivery explanation.
8. Customer explicitly confirms. The order transaction persists order/seller orders/items/snapshots/reservations/COD decision/outbox.
9. Confirmation displays public order reference, per-group estimate, pending/confirmed state, and tracking CTA; notification delivery is asynchronous.

Failure paths: stock race → identify affected line and restore review; price/promotion change → require acknowledgement; courier quote unavailable → retry or offer configured safe mode, never promise; OTP delay → resend limits and alternate support; risk review → pending state without duplicate order; partial seller rejection → policy-controlled reassignment/cancellation and notification.

## Journey 3 — Hosted electronic payment

1. Checkout creates a payment intent against the immutable amount/currency/order attempt.
2. Customer is redirected to an approved hosted/certified provider; the marketplace never asks for raw card secrets.
3. Provider return is advisory; server-to-server authenticated webhook/status lookup is authoritative.
4. Delayed webhook leaves `PENDING/REQUIRES_ACTION`; refresh safely queries status without creating another payment.
5. Authorized/captured success confirms the appropriate order transition and inventory commitment exactly once.
6. Failure allows an approved retry/new attempt while retaining complete payment-attempt history.

Customer sees plain-language status, not provider internals. Support sees provider reference, safe event timeline, correlation ID, and reconciliation status.

## Journey 4 — Split fulfillment and tracking

- Order detail shows marketplace order first, then seller/fulfillment groups and shipment timelines.
- Each shipment independently moves through preparing → handoff → in transit → out for delivery → delivered/failed/return-to-sender.
- Notifications deep-link to the correct shipment and remain consistent with event state.
- Customer can update instructions only where courier/policy supports it; never mutate an already contracted address silently.
- Partial delivery keeps remaining groups active. A failed package does not mark the marketplace order fully delivered.

## Journey 5 — Cancellation

| Point                     | Behavior                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Before fulfillment        | Eligible line/seller order cancels automatically; reservation releases; payment void/refund or COD adjustment follows                        |
| Packed but not handed off | Request enters operations approval based on configuration                                                                                    |
| Shipped                   | Explain that cancellation is unavailable; offer refusal/return path subject to policy                                                        |
| Partial order             | Cancel only eligible quantities/groups; totals, promotions, refund, seller ledger, and order derived status recalculate from immutable facts |

Customer provides a reason; the system records who/when/why and notifies affected parties.

## Journey 6 — Return, inspection, and refund

1. Customer selects delivered item and quantity; system explains eligibility from policy snapshot and delivery timestamp.
2. Customer chooses reason, adds comment and safe image/video evidence, and sees privacy guidance.
3. System creates RMA in `REQUESTED`; duplicate submission is idempotent.
4. Automated rules or authorized reviewer approves, requests information, or rejects with reason and appeal/support path.
5. Reverse-shipment/pickup instructions are created; tracking is separate from original shipment.
6. Warehouse/seller receives item and inspects condition, accessories, packaging, and serial/IMEI match; disposition is restock/refurbish/return-to-vendor/dispose.
7. Approved amount creates refund and seller-ledger adjustments. Electronic/COD methods follow configured, legally reviewed process.
8. Customer receives initiated/completed/failed status and expected timing. Other order items remain unchanged.

## Journey 7 — Support and dispute

- Entry from help, order, return, refund, payment, shipment, or seller pages pre-fills safe context.
- Ticket receives category, priority, SLA, owner, messages, attachments, and internal notes.
- Agent views complete audit-safe timeline but sensitive data is masked by permission.
- Adjustments, cancellations, refunds, or account restrictions require separate permission, reason, step-up where configured, and audit.
- Waiting-customer/seller/courier states pause or alter SLA by documented policy; escalation has owner and deadline.
- Resolution message explains outcome and remaining recourse; closure is reversible only through controlled reopen policy.

## Journey-wide analytics

Minimum events: page_view, search, search_result_click, product_view, offer_selected, add_to_cart, remove_from_cart, checkout_started, address_selected, shipping_selected, payment_selected, order_submit_attempt, order_placed, payment_success/failure, shipment_viewed, cancellation_requested, return_requested, refund_viewed, support_created, purchase_completed. Events use pseudonymous IDs, consent classification, schema versions, and server confirmation for financial milestones.

## Journey-wide accessibility/localization acceptance

- Complete keyboard and screen-reader path for web purchase and self-service.
- Focus moves predictably after errors, step changes, modals, and direction switches.
- Arabic and French customer journeys have content/policy parity and real visual QA.
- Currency/identifier display is bidi-safe; no translated identifiers or locale-dependent API values.
- Low-bandwidth retry never duplicates order, payment, evidence, ticket, or return.
