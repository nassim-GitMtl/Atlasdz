# ADR-011 — Seller-fulfilled marketplace release scope

- Date: 2026-10-06.
- Status: accepted product-scope decision from the project owner; implementation authorized.
- Decision source: the owner's instruction, “its like amazon but the order will go to the seller. we dont fufill,” followed by the supplied “Continue Project Atlas DZ … using this revised business model” prompt.
- Supersedes: conflicting hybrid-marketplace, nine-application, warehouse, fleet, platform-inventory, cash-custody, and mandatory seller-settlement requirements in the original Phase 0 package. ADR-007's mandatory seller subledger becomes conditional on an approved platform fund flow.
- Does not confer: legal, accounting, privacy, security, provider, or production-launch approval.

## Decision and precedence

Atlas DZ is an Algeria-first, Arabic/French, seller-fulfilled marketplace with an original visual identity and familiar marketplace shopping conventions. The platform records customer purchases and sends each seller their own orders. Sellers prepare, pack, dispatch, and arrange delivery of the goods they sell.

This decision and the revised [scope phasing](../phase-0/22-scope-phasing.md) take precedence over conflicting requirements anywhere in the Phase 0 package, including `MUST`, release gates, application inventories, diagrams, schema sketches, and roadmap promises. The original detailed material remains useful historical design context. Its presence does not authorize building an excluded capability or make that capability a launch prerequisite.

The owner has authorized safe implementation and testing. Earlier instructions to stop all implementation until specialist approvals are superseded for that work. Required professional review, real-provider decisions, deployment authorization, and release evidence remain separate gates. Current implementation and verification state belongs in the [readiness ledger](../implementation/PRODUCTION-READINESS.md).

## Responsibility boundary

| Capability | Atlas DZ                                                                           | Seller                                                                             |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Catalog    | Own category policy, shared product records, moderation, and discovery             | Supply accurate offer, price, availability, product, and media information         |
| Order      | Record checkout, split seller orders, enforce access, route reliably, retain audit | Receive, accept/reject under policy, and process its own orders                    |
| Inventory  | Track seller quantities and reserve atomically to prevent oversell                 | Own goods and maintain their availability                                          |
| Delivery   | Display seller coverage, charges, handling times, and attributed updates           | Configure coverage/charges, pack, dispatch, arrange delivery, and provide updates  |
| Returns    | Record requests, policy, evidence, decisions, support, and disputes                | Handle physical returns and remedies through approved arrangements                 |
| Money      | Record only the payment/fee evidence required by the approved model                | Seller or its provider collects COD where approved; other flows require a decision |

## Release classification

| Requirement                                                                               | Classification                                           | Release implication                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Responsive Customer Web                                                                   | IN_SCOPE                                                 | Complete purchase, order visibility, account, return, and support journeys                         |
| Responsive Seller Center                                                                  | IN_SCOPE                                                 | Complete offer-to-order-to-dispatch workflow                                                       |
| Marketplace Admin and Support                                                             | IN_SCOPE                                                 | May share one application with separate permissions                                                |
| Seller stock and reservations                                                             | IN_SCOPE                                                 | PostgreSQL-backed, concurrency-safe, auditable                                                     |
| Seller delivery configuration and shipment updates                                        | IN_SCOPE                                                 | Manual attributed updates are permitted; integration follows approved arrangements                 |
| Marketplace-owned inventory and procurement                                               | OUT_OF_SCOPE                                             | No platform goods ownership or purchasing workflow                                                 |
| Warehouses, receiving, putaway, pick/pack, cycle counts, and warehouse returns inspection | OUT_OF_SCOPE                                             | No Warehouse Console or warehouse release gate                                                     |
| Platform fleet, driver app, route assignment, and courier cash handoff                    | OUT_OF_SCOPE                                             | Sellers arrange delivery; no fleet release gate                                                    |
| Platform goods custody or COD cash custody/remittance                                     | OUT_OF_SCOPE                                             | Do not model Atlas DZ as goods or cash custodian                                                   |
| Fulfillment-by-platform and warehouse/fleet operations application                        | OUT_OF_SCOPE                                             | A later separate business-model decision is required                                               |
| Native customer/seller mobile applications                                                | DEFERRED                                                 | Responsive web is the launch surface                                                               |
| Online payment                                                                            | CONDITIONAL                                              | Disabled until fund flow, provider, responsible party, and operational evidence are approved       |
| Platform wallet, seller payout engine, complex settlement/subledger                       | OUT_OF_SCOPE unless a new approved fund flow requires it | Do not make a fund-handling system a prerequisite for a marketplace that never handles those funds |
| Marketplace fees/accounting records                                                       | CONDITIONAL                                              | Implement only approved fee and accounting requirements; rates remain unresolved configuration     |

## Customer-to-seller transaction

1. An approved seller publishes a moderated offer with quantity, price, coverage, shipping charges, and handling time.
2. Checkout validates availability, seller eligibility, delivery coverage, and current prices. It displays per-seller shipping and the complete total before confirmation.
3. One idempotent database transaction creates the customer order and seller orders, records immutable commercial/policy snapshots, reserves seller stock, and writes routing events to the outbox.
4. Seller Center exposes each seller's committed order inbox. Outbound notifications are retryable signals; their failure must not lose or hide the order.
5. Each seller order moves through explicit, authorized states: placed → awaiting acceptance → accepted → preparing → shipped → delivered, with rejection, cancellation, expiration, failed-delivery, return, and dispute branches.
6. Stock reservation release follows rejection, cancellation, or expiry; unrelated seller orders remain intact. Acceptance deadlines and exceptions require configured policy rather than invented defaults.
7. Shipment and delivery changes retain their actor, source, time, and evidence. A seller-reported delivery is not independent proof. Customer confirmation and disputes follow the approved policy.
8. Customer order status derives from the child seller orders. Payment state remains separate from shipment state. Notification delivery alone changes neither.

Seller authorization applies to every command, read, attachment, and notification recipient. A seller sees only its own items and the customer/delivery information it is authorized to use for that order.

## Payment, return, and policy boundaries

Do not assume Atlas DZ receives or holds customer funds. COD collection belongs to the seller or its delivery provider only where the arrangement is approved. An electronic-payment decision must identify whether funds go directly to the seller or through the platform before that path is enabled. Unsupported flows remain disabled.

Commission, tax, invoice, acceptance, cancellation, return, retention, delivery, and refund policies remain explicit decisions and configuration. Refund responsibility follows the real payment method and responsible party. A refund cannot be called complete without evidence.

The changed operating model does not establish an exemption from any legal, tax, privacy, consumer, or accounting obligation. Relevant qualified reviewers must determine those obligations for the actual business and fund flow. Engineering may continue using synthetic data and local/test adapters while the affected commercial paths remain disabled.

## Delivery sequence and proof

1. Seller publishes an approved offer; customer discovers it.
2. Customer purchases; correct seller receives a persistent order.
3. Seller accepts, prepares, dispatches, and completes; customer follows progress.
4. Customer cancels where permitted, requests a return, and obtains support.
5. Admin moderates sellers/listings and resolves order disputes.
6. Verify the integrated release, deployment package, restoration, rollback, and operational readiness.

Each milestone requires persistent data, server authorization, appropriate automated tests, and real-browser French/Arabic verification. Mandatory commerce evidence includes seller isolation, duplicate-checkout prevention, oversell prevention, reservation release, partial rejection, notification failure, unauthorized status changes, return/dispute history, correct per-seller shipping, and mobile/desktop accessibility.

The existing TypeScript/pnpm/Next.js/NestJS/PostgreSQL architecture, identity foundation, security controls, immutable snapshots, domain ownership, outbox, and synthetic-test restrictions remain applicable. Excluded models in existing code or schemas may be preserved without activating them; destructive cleanup is not part of this decision.

## Readiness and change control

Report separately: technically deployable, controlled staging/pilot ready, and commercial production ready. Each verdict needs evidence for this release's applicable scope. Out-of-scope warehouse, fleet, platform-stock, platform-cash-custody, and unconditional settlement requirements cannot block this release.

A later change introducing goods custody, cash custody, a platform wallet, platform-funded settlement, a warehouse, a fleet, or marketplace fulfillment requires a new owner decision, explicit scope, fund/data-flow design, applicable professional review, implementation, and release evidence. It is not automatically part of Phase 2 or Phase 3.
