# Executive Summary and Architecture Approval Gate

Current product-scope authority: [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md), accepted from the owner on 2026-10-06. Earlier hybrid, warehouse, fleet, platform-stock/cash-custody, and mandatory settlement requirements are superseded for this release. Applicable specialist approvals remain pending; authorized implementation may proceed.

## Decision summary

Project Atlas DZ will be an original Arabic/French, mobile-first, seller-fulfilled marketplace for Algeria. Approved sellers publish offers against a shared master catalog. Customers buy through Atlas DZ; the platform records and routes the orders, and sellers handle acceptance, packing, dispatch, delivery arrangements, and physical returns. One customer checkout may split into multiple isolated seller orders and shipments while preserving one customer-facing order.

The recommended starting architecture is a TypeScript monorepo and modular monolith with strict bounded contexts, PostgreSQL as system of record, Redis for ephemeral state, OpenSearch for multilingual discovery, S3-compatible object storage, an outbox-backed event bus, and replaceable adapters for payment, courier, notification, maps, search, and storage providers. High-volume or high-risk modules can be extracted behind existing contracts when measured load justifies it.

The required release applications are:

1. Customer responsive web marketplace.
2. Responsive Seller Center.
3. Marketplace Admin and Support, which may share one application with separate permissions.

Native mobile is deferred. Warehouse, courier fleet, warehouse/fleet Operations, and unconditional Finance/Settlement applications are OUT_OF_SCOPE. Applicable technical monitoring and approved accounting records remain required within the actual operating model.

## Non-negotiable invariants

- A master `Product` describes what an item is; a seller `Offer` describes who sells it, at what price, under what fulfillment and policy; a `Variant/SKU` identifies a purchasable configuration.
- No seller can create arbitrary categories. Central category policy controls attributes, restrictions, returns, commission, shipping, and moderation.
- No order, payment, shipment, return, refund, settlement, seller status, or product-moderation state changes outside its domain service.
- Checkout, provider callbacks, refunds, shipment creation, and payouts are idempotent.
- Inventory reservation is concurrency-safe; confirmed sales cannot exceed sellable stock.
- Purchase prices, fees, taxes, discounts, delivery promises, policies, and addresses are immutable snapshots on the order.
- Any financial balances required by an approved fund flow derive from immutable financial records, never mutable order totals. A platform seller subledger and payout engine are not mandatory when Atlas DZ does not handle seller funds.
- Raw PAN, CVV, PIN, or equivalent authentication secrets are never stored or logged.
- Every privileged decision has actor, reason, source, correlation ID, before/after where safe, and timestamp.
- Backend authorization is authoritative; frontend visibility never grants permission.
- Arabic changes layout direction and interaction geometry, not only strings.
- Legal, tax, payment, hosting, and category-policy conclusions remain subject to qualified Algerian review.

## Architecture decisions proposed for approval

| ID      | Decision                                                                                | Rationale                                                                                                         | Revisit trigger                                                        |
| ------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ADR-001 | Modular monolith first                                                                  | Transactional consistency and delivery speed without premature distributed systems                                | Sustained scaling, release-cadence, isolation, or ownership bottleneck |
| ADR-002 | TypeScript across web and backend; React Native for mobile                              | Shared contracts and talent leverage; Lovable-compatible frontend path                                            | Mobile performance or native integration evidence                      |
| ADR-003 | PostgreSQL transactional source of truth                                                | Constraints, transactions, relational integrity, mature operations                                                | Domain-specific scale proven by measurements                           |
| ADR-004 | OpenSearch discovery index                                                              | Arabic/French analysis, faceting, typo tolerance, independent scaling                                             | Managed provider or residency constraint                               |
| ADR-005 | Transactional outbox plus durable broker                                                | No lost domain events after database commit                                                                       | Broker selection and throughput validation                             |
| ADR-006 | Hosted/certified payment flows                                                          | Reduce sensitive-data exposure and certification scope                                                            | Provider contract requires an approved alternative                     |
| ADR-007 | Conditional immutable seller subledger; unconditional requirement superseded by ADR-011 | Needed only if the approved platform fund flow requires proceeds, holds, and payouts                              | Approved change introducing platform funds handling                    |
| ADR-008 | Configuration and feature flags for policy                                              | Operations must change COD, commissions, moderation, shipping, and rollout safely                                 | Never; governance may mature                                           |
| ADR-009 | Algeria-ready deployable topology, provider-neutral IaC                                 | Hosting and `.com.dz` obligations must remain satisfiable                                                         | Counsel and selected host confirm final topology                       |
| ADR-010 | No visual implementation before design direction selection                              | Prevent unapproved brand/UI from becoming accidental product                                                      | Product/design approval                                                |
| ADR-011 | [Seller-fulfilled marketplace](../decisions/ADR-011-seller-fulfilled-marketplace.md)    | Owner directs customer purchases to sellers who fulfill them; excluded platform fulfillment must not block launch | Explicit later business-model decision                                 |

## Working assumptions

- The final brand is not selected. `Project Atlas DZ` is an internal codename only.
- Arabic and French ship in MVP; English is Phase 2 unless commercial leadership promotes it.
- Guest discovery and cart are allowed; account/verified phone is required to place COD orders.
- Marketplace-controlled catalog and seller offers launch in MVP.
- Sellers configure supported delivery methods, coverage, charges, and handling times. Seller-arranged delivery and attributed manual updates do not require a marketplace fleet.
- COD is enabled only under approved seller/provider collection arrangements. Atlas DZ is not assumed to receive or hold cash. Electronic payment stays disabled until the recipient/fund flow, provider, applicable review, certification, and operations are approved.
- Mobile web launches before native mobile. Native mobile is a later vertical unless leadership funds parallel delivery.
- One legal marketplace entity and DZD order pricing are assumed for initial release; this does not assume platform settlement.
- Tax, invoice, return-window, retention, COD ceiling, commission, SLA, and settlement-hold values are unresolved configuration—not guessed defaults.

## Decisions for affected paths and commercial release

Safe implementation with synthetic data and test adapters is authorized. The decisions below must be resolved before the affected real-provider or commercial path is enabled; they do not require stopping unrelated implementation.

| Decision owner             | Required decision                                                                                                                                         | Why blocking                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Executive/Product          | Brand, target launch categories, launch wilayas, B2C positioning, MVP budget/timeline                                                                     | Controls catalog, UX, operations, and rollout                |
| Algerian legal counsel     | Law 18-05 obligations, seller documents, prohibited/regulated categories, contract/record retention, returns, privacy notices, hosting/domain obligations | Release compliance                                           |
| Accounting/Tax             | Taxes, invoicing, any approved fees, seller/provider COD records, and accounting for the actual fund flow                                                 | Applicable money model and documents                         |
| Payments/Finance           | Whether funds go directly to sellers or through the platform, authorized providers if enabled, and refund responsibility                                  | Integration and evidence required only for the approved flow |
| Seller/Delivery Operations | Seller delivery coverage, charges, handling/acceptance rules, delivery evidence, returns, and seller/provider COD arrangements                            | Accurate checkout promises and accountable seller handling   |
| Security                   | Identity provider choice, MFA method, KMS/secrets, log redaction, threat model acceptance                                                                 | Control design                                               |
| Platform                   | Algerian-compliant hosting target, broker/search/object-store providers, RPO/RTO                                                                          | IaC and operational model                                    |
| Data Governance            | Retention schedule, analytics consent, account deletion/anonymization policy                                                                              | Schema and privacy workflows                                 |
| Product Design             | Final brand direction and first target screen/flow                                                                                                        | Required before UI build                                     |

## Architecture approval checklist

- [x] Seller-fulfilled product scope and MVP exclusions accepted by the owner on 2026-10-06 (ADR-011).
- [ ] Customer Web, Seller Center, and Marketplace Admin/Support ownership and applicable screen inventory accepted.
- [ ] Product/variant/offer and order/seller-order boundaries accepted.
- [ ] State machines and transition authorities accepted.
- [ ] Applicable ERD, order snapshots, and approved fund-flow records accepted; platform ledger/settlement only if required by that flow.
- [ ] API, event, error, notification, and provider contracts accepted.
- [ ] RBAC and segregation-of-duties matrix accepted.
- [ ] Algerian counsel/accounting findings attached and checklist owners assigned.
- [ ] Security threat model and data classification accepted.
- [ ] Hosting, residency, DR, SLO, RPO, and RTO targets accepted.
- [ ] Test, rollout, observability, and incident ownership accepted.
- [x] Visual ideation completed and direction 2, “Mobile Bazaar,” selected before UI code (owner decision, 2026-10-02).
- [ ] Architecture approval recorded with approvers, date, exceptions, and expiry/review date.

## Owner decision record

The project owner approved the Phase 0 product and architecture direction for prototyping on 2026-10-02 and selected Product Design direction 2, “Mobile Bazaar,” for the first Customer Web homepage prototype. This authorization permits visual and interaction prototyping; it does not substitute for the specialist approvals below or authorize production release.

On 2026-10-06 the owner superseded the hybrid model with seller fulfillment and authorized continued safe implementation and testing. ADR-011 records this decision. Earlier blanket implementation restrictions are superseded by that authorization; professional and commercial-launch approvals are not supplied by it.

## Approval record

| Function                       | Approver                                 | Decision                                                        | Date       | Conditions                                                                                          |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Product                        | Project owner (chat record)              | Approved for prototyping                                        | 2026-10-02 | Launch scope remains subject to the unresolved decisions above                                      |
| Architecture                   | Project owner (chat record)              | Approved for prototyping                                        | 2026-10-02 | Production modules remain gated by specialist review                                                |
| Product scope / implementation | Project owner (revised chat instruction) | Seller-fulfilled scope accepted; safe implementation authorized | 2026-10-06 | Supersedes earlier blanket implementation gate; no public deployment or specialist sign-off implied |
| Security                       | Unassigned                               | Pending                                                         | —          | —                                                                                                   |
| Finance                        | Unassigned                               | Pending                                                         | —          | —                                                                                                   |
| Operations/Logistics           | Unassigned                               | Pending                                                         | —          | —                                                                                                   |
| Legal/Compliance               | Qualified Algerian reviewer required     | Pending                                                         | —          | —                                                                                                   |
| Product Design                 | Project owner (chat record)              | Direction 2 selected                                            | 2026-10-02 | `atlas dz` remains a provisional working identity pending brand clearance                           |
