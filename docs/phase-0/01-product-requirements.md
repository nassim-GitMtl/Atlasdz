# Product Requirements Document

Current scope: [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and the revised [scope phasing](22-scope-phasing.md), accepted by the owner on 2026-10-06, supersede conflicting hybrid-platform requirements. Detailed historical capabilities apply only where they fit that seller-fulfilled release.

## 1. Product definition

Project Atlas DZ is a seller-fulfilled marketplace for Algerian commerce. Customers discover, compare, order, track, request returns, and receive support for products sold by approved sellers. The platform records purchases and sends sellers their orders. Sellers control their offers, quantities, delivery coverage/charges, acceptance, packing, shipping, delivery arrangements, and physical returns. Internal teams moderate the marketplace, manage policy, and handle support and disputes.

A successful order must remain reconstructable from offer selection through seller-stock reservation, checkout, seller routing and acceptance, shipment, delivery evidence, cancellation/return, payment-specific remedies, and audit. Platform ownership or custody of goods or money is not assumed.

## 2. Vision and value propositions

### Customer

- Search and compare products and genuine offers in Arabic or French.
- Know the seller, total price, availability, delivery estimate, warranty, return eligibility, and payment method before confirmation.
- Checkout once across multiple sellers and track each package independently.
- Use Algeria-aware addresses, home delivery or supported pickup, COD, and approved electronic payments.
- Receive consistent support, cancellation, return, dispute, and refund handling.

### Seller

- Join through a traceable business-verification workflow.
- Match an existing catalog product or request a moderated master product instead of duplicating records.
- Manage offers, variants, quantity, delivery settings, orders, returns, performance, support interactions, and disputes.
- See accurate order/sales reports and any approved marketplace fee records. Payout and settlement tooling is conditional on an approved fund flow that requires it.

### Marketplace operator

- Control categories, products, brands, sellers, policy, risk, promotions, fulfillment, content, finance, and permissions.
- Configure business policy without redeploying code.
- Detect restricted goods, duplicate catalog records, COD abuse, counterfeit indicators, payment/cash discrepancies, SLA breaches, and stock anomalies.
- Reconstruct every privileged, operational, and financial decision.

## 3. Goals and non-goals

### Goals

1. Launch a legally reviewable Algeria-first marketplace with Arabic/French parity.
2. Complete the happy path and exception paths for catalog → checkout → seller inbox → seller processing → shipment/delivery → return/support/remedy.
3. Support seller-owned stock and platform-managed reservations without duplicating master catalog content.
4. Attribute seller/provider COD and refund reports accurately where that collection arrangement is approved; do not imply platform cash custody.
5. Create provider-neutral payment, courier, notification, search, maps, and storage interfaces.
6. Scale by measurement while preserving a path to independently deployed services.
7. Reach WCAG 2.2 AA where practical and remain usable on narrow, variable-bandwidth mobile connections.

### Non-goals for MVP

- Marketplace-owned goods, warehouses, procurement, platform packing/dispatch, fleet/driver applications, and platform goods/COD custody.
- Platform wallet, payout engine, and complex seller settlement unless an approved fund flow requires them.
- Native applications as launch prerequisites; responsive customer and seller web are required.
- International sales, cross-border customs, foreign currencies, or multilingual markets outside Algeria.
- Open-ended seller-created categories.
- A marketplace wallet, consumer credit, crypto, or stored card data.
- Unmoderated customer–seller contact details or chat.
- B2B/wholesale pricing, subscriptions, auctions, grocery expiry optimization, or digital goods.
- ML-dependent recommendations, autonomous fraud rejection, or dynamic pricing.
- Nationwide same-day delivery claims without contracted capacity.

## 4. People and roles

Required external roles: guest, customer, seller owner, seller organization manager, and seller operator. Required internal responsibilities cover administration, customer service, catalog/seller moderation, policy, privacy, security, and audit under granular permissions. Existing warehouse/courier role designs are historical and inactive for this release; any finance permissions follow the approved business model. System actors include scheduler, integration adapters, webhook processors, and service accounts.

`SELLER_MANAGER` is split into `MARKETPLACE_SELLER_MANAGER` and `SELLER_ORG_MANAGER` to remove the ambiguity in the source brief.

## 5. Product surfaces

| Application                          | Primary users             | Core outcome                                                                                                |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Customer Web                         | Guest, customer           | Discover, purchase, track, and self-serve                                                                   |
| Customer Mobile                      | Customer                  | DEFERRED; responsive web launches first                                                                     |
| Seller Center                        | Seller organization       | Onboard, publish offers, receive/process orders, arrange delivery, manage returns/performance               |
| Marketplace Admin                    | Internal authorized staff | Govern marketplace policy and records                                                                       |
| Service Console                      | Customer service          | Resolve customer/seller cases with full timeline                                                            |
| Warehouse Console                    | —                         | OUT_OF_SCOPE                                                                                                |
| Courier App                          | —                         | OUT_OF_SCOPE                                                                                                |
| Warehouse/fleet Operations Dashboard | —                         | OUT_OF_SCOPE; technical monitoring remains required                                                         |
| Finance/Settlement Console           | —                         | OUT_OF_SCOPE unless an approved fund flow requires it; applicable fee/accounting records remain conditional |

## 6. Core domain requirements

### Identity and account

- Phone/password, email/password, and approved OTP flows; future approved federation behind an identity adapter.
- Modern password hashing, session inventory, rotating refresh tokens, per-session and all-session logout, rate limiting, brute-force controls, and suspicious-login monitoring.
- MFA mandatory for seller and internal privileged roles.
- Customer profile, addresses, language, communication preferences, privacy requests, and deletion workflow.

### Catalog and merchandising

- Centrally managed category tree with required/optional/filter/variant attributes and category-specific policy.
- Master products, purchasable variants, media, technical attributes, brand records, and separate seller offers.
- Seller product matching, moderated new-product requests, duplicate detection, regulated-category routing, brand authorization, and counterfeit-case management.
- CMS-controlled, scheduled, localized homepage and campaign content.

### Search and discovery

- Arabic/French/English-aware indexing, Arabic normalization/transliteration where validated, synonyms, fuzzy/prefix matching, typo tolerance, facets, and ranking by relevance plus commercial-quality signals.
- Search analytics including query, results, click, conversion, and zero-result reporting.
- Rule-based related/recommended products in MVP; personalization/ML cannot block checkout.

### Pricing and promotions

- Effective-dated offer prices, compare-at prices, marketplace/seller-funded discounts, promo codes, automatic campaigns, flash sales, free shipping, eligibility, limits, and deterministic stacking priority.
- All calculations use integer minor units or safe decimal semantics and persist calculation snapshots.

### Inventory

- Seller-owned quantity, reserved quantity, and sellable availability per offer/SKU; no marketplace warehouse ownership model.
- Atomic reservations, expiry/release, seller stock adjustment history, and consumption at the approved seller-order transition. Warehouse receiving, cycle counts, and platform physical stock movements are OUT_OF_SCOPE.
- No negative sellable stock and no silent stock repair.

### Cart and checkout

- Multi-seller cart grouped by seller with saved-for-later, eligibility, stock, price, delivery estimate, discounts, shipping, taxes, and total.
- Address → per-fulfillment delivery → payment → review → explicit confirmation → confirmation reference.
- Revalidation at confirmation and idempotent order creation.
- One marketplace order splits into seller orders and fulfillment groups without losing the customer-level view.

### COD and electronic payment

- Atlas DZ does not assume custody of funds. COD collection belongs to the seller or its delivery provider where approved. Keep payment state independent of fulfillment and distinguish reported from independently verified collection.
- Online payment remains disabled until the recipient/fund flow, provider, and refund responsibility are approved. Provider requirements below apply only to the enabled approved payment path.
- Explainable COD risk outcome: accepted, verification required, manual review, or rejected; no protected/irrelevant characteristics.
- OTP/call-center confirmation and auditable reason codes.
- Payment-provider contract for authorize, capture, cancel, refund, status, webhook, and reconcile.
- Authenticated, persisted, idempotent webhooks and provider reconciliation; no sensitive card-data storage.

### Orders, fulfillment, and delivery

- Separate explicit marketplace-order, seller-order, shipment, payment, return, refund, and dispute states; settlement only if an approved flow requires it.
- Seller inbox and accept/reject, prepare, dispatch, and delivery-update actions. Coverage, shipping charges, handling times, and acceptance deadlines are seller/policy configuration.
- Seller-arranged shipping uses tracking/carrier details or permitted manual updates with attribution, reason, timestamp, and evidence. The platform offers customer visibility and support, not a warehouse or courier route application.
- Orders and routing events commit atomically; notification failure does not lose an order or change acceptance/payment/shipment state.

### Returns, refunds, and disputes

- Item/quantity-level eligibility using delivery date, policy snapshot, category, seller, condition, and window.
- Evidence upload, return request/approval, seller physical-return arrangements, seller decision/evidence, refund responsibility according to the payment method, dispute, and customer notification. No platform warehouse return inspection is required.
- One returned item does not mutate unaffected seller orders or shipments.

### Seller finance

- Implement accurate seller order/sales reporting and only the fee/accounting records required by the approved business model. Do not invent commission rates, tax rates, or payout terms.
- A platform wallet, seller payout engine, and complex settlement/subledger are OUT_OF_SCOPE unless an approved fund flow requires them. Any later funds-handling change needs explicit design and review under ADR-011.

### Support, risk, and administration

- Omnichannel ticket intake with order/seller/payment/shipment timeline, attachments, internal notes, ownership, SLA, escalation, and controlled adjustments.
- Configurable fraud rules and cases for COD refusal, velocity, promo abuse, account linkage, reviews, sellers, and payments. Material adverse action requires human-review policy and reason.
- All sensitive admin actions require permission, reason, and audit record.

## 7. Localization and Algeria experience

- Arabic and French are first-class content locales. UI, CMS, notification, document, search, and policy content are versioned per locale.
- `dir=rtl`/`ltr` applies at the document root; logical CSS properties, mirrored navigation and directional icons, bidi-safe identifiers, correct form alignment, and manual screen review are required.
- Currency, dates, numbers, plural forms, names, phone numbers, wilaya/commune addresses, and delivery calendars use locale-aware formatters; values remain locale-neutral in APIs.
- Search supports Arabic script and French spelling; transliteration/synonyms are curated and measurable rather than guessed in business logic.
- Algeria address data comes from a maintained, versioned, authoritative dataset with operational overrides and change history.

## 8. Trust, compliance, and policy disclosures

Before confirmation, the customer must see merchant identity, product/offer description, total price and components, stock, shipping method and price, realistic delivery range, warranty, after-sales terms, payment procedure, cancellation, return, reimbursement, complaint procedure, and applicable terms. Acceptance evidence and order/contract records are preserved under an approved retention schedule.

Restricted categories can be blocked, documentation-gated, or routed to compliance review. Seller verification or authenticity badges derive only from actual state. Production launch requires qualified Algerian legal and accounting sign-off; the architecture is compliance-capable, not legal certification.

## 9. Experience requirements

- Mobile-first responsive web from 320 px through large monitors and under low bandwidth; native apps are deferred.
- Every screen has loading, empty, success, validation, authorization, recoverable error, and offline/network states when relevant.
- Visible focus, keyboard operation, semantic HTML/native controls, labels, contrast, reduced motion, live-region restraint, and screen-reader testing target WCAG 2.2 AA.
- Product and checkout pages prioritize a clear main task; internal tools optimize scanability, safe bulk actions, and explicit consequences.
- No copied Amazon/Jumia/Noon/Walmart brand, text, logo, or pixel-for-pixel layout.

## 10. Non-functional requirements and initial SLO proposals

These targets require load-model approval before implementation.

| Area                | Proposed target                                                                       |
| ------------------- | ------------------------------------------------------------------------------------- |
| Availability        | Browse/search 99.9%; checkout/order read 99.95%; internal tools 99.5% monthly         |
| API latency         | p95 reads ≤ 400 ms and writes ≤ 700 ms excluding provider latency                     |
| Search latency      | p95 ≤ 500 ms for cached/common queries                                                |
| Page performance    | p75 mobile LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on defined test profile               |
| Order correctness   | No acknowledged order without durable order + outbox record                           |
| Inventory           | Oversell caused by platform race: zero tolerated                                      |
| Financial integrity | Every external financial movement reconciled; unresolved discrepancy aged and alerted |
| RPO/RTO             | Core orders/payments RPO ≤ 5 min, RTO ≤ 60 min proposed; approval required            |
| Security            | Critical vulnerabilities block release; privileged MFA coverage 100%                  |
| Accessibility       | Critical purchase and operations flows have no known WCAG A/AA blockers               |
| Localization        | Arabic/French critical-flow parity 100%; no untranslated release-blocking keys        |

## 11. Product success measures

- Search success, zero-result rate, product-view-to-cart conversion, checkout completion, payment success.
- COD verification, acceptance, refusal, and attributed seller/provider collection/dispute rates where enabled; no platform remittance metric is assumed.
- Fill rate, oversell rate, seller acceptance/dispatch, on-time handoff, delivery success, first-attempt delivery.
- Cancellation, return, defect, refund cycle time, support first response and resolution.
- Active sellers/offers, catalog approval time, product-data completeness, counterfeit/policy-case rate.
- GMV and order/seller performance; marketplace revenue/fees and payment reconciliation only as required by the approved business model.
- Arabic/French parity, accessibility defects, crash/error-free sessions, latency and availability SLOs.

Metrics must have owners, definitions, numerator/denominator, event source, exclusion rules, freshness, and privacy classification before dashboards are trusted.

## 12. Feature delivery contract

Every feature specification and pull request must identify: business requirement; roles; user story; acceptance criteria; screens/components; schema migration; endpoints; validation; permissions; business rules; events; notifications; audit; failures; unit/integration/E2E tests; security; monitoring; rollout/rollback; Arabic RTL and French behavior. Missing items are explicit `not applicable` decisions, never omissions.

## 13. Definition of done

A feature is done only when UI, responsive behavior, Arabic/French, backend, database, authorization, validation, concurrency/idempotency, tests, errors, logs, metrics, audit, runbook/documentation, staging evidence, migration/rollback, and product acceptance are complete. External adapters may be simulated only in local/test; production readiness requires contracted and certified integrations.
