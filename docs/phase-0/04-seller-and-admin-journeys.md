# Seller, Internal Operations, and Admin Journeys

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

## Seller journey — Apply to first sale

1. **Secure account:** owner registers, verifies phone/email, enrolls MFA, accepts identity/privacy notices.
2. **Business profile:** chooses legally supported type and enters legal/trade name, registration/tax information, physical/electronic address, phone, representative.
3. **Evidence:** uploads required documents through signed upload, MIME/signature validation, malware scan, encryption, limited reviewer access, and retention policy.
4. **Settlement and pickup:** provides verified payout data through step-up auth and adds warehouse/pickup address.
5. **Agreement:** sees versioned seller terms/commission/returns/fulfillment obligations and records explicit acceptance.
6. **Review:** application moves DRAFT → SUBMITTED → UNDER_REVIEW → MORE_INFORMATION_REQUIRED/APPROVED/REJECTED. Suspension is a later controlled state, not an onboarding shortcut.
7. **Catalog match:** seller searches master catalog. Existing product leads to a seller offer; missing product leads to a moderated master-product request.
8. **Offer readiness:** variants, price, inventory, shipping dimensions/weight, warranty, fulfillment, images, and policy validate before moderation/activation.
9. **First order:** seller accepts if policy requires, prints documents, captures serial, packs, labels, marks ready, and completes courier handoff.
10. **Settlement:** delivery/return hold and ledger rules determine eligibility; seller receives statement and traceable payout.

Failure/appeal paths: failed verification, document expiry, duplicate product, regulated category, unauthorized brand claim, insufficient stock, late dispatch, return dispute, payout discrepancy, restriction/suspension. Every action has reason, evidence, owner, deadline, and appeal route.

## Seller daily operations

| Task        | Seller action                              | Platform guardrail                                                  | KPI                          |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------- |
| Inventory   | Import or adjust SKU/location quantity     | Reasoned movement, optimistic version, no overwrite of reservations | stock accuracy, out-of-stock |
| Order queue | Filter new/preparing/ready                 | Seller scope; SLA clock; state transition validation                | acceptance/dispatch time     |
| Packing     | Verify item, serial, quantity; print label | Scan/serial uniqueness; immutable order item                        | defect/mis-ship rate         |
| Returns     | Review reason/evidence/inspection          | Cannot delete evidence or unilaterally reject marketplace decision  | return/dispute rate          |
| Performance | Review defects and warnings                | Metric definition and appeal evidence visible                       | policy health                |
| Finance     | Reconcile order to ledger/statement        | Immutable entries and payout references                             | aged balance/discrepancy     |

## Catalog manager journey

1. Open prioritized moderation queue with automated validation/restriction/duplicate signals.
2. Review category, required attributes, brand/model identifiers, localized title/description, images, variant structure, and prohibited/regulated policy.
3. Compare likely duplicates; merge only with a preview of variants/offers/references and reversible migration plan.
4. Approve, request changes, reject, route to compliance, or deactivate using permission and reason.
5. Publish outbox event; search/read projections update asynchronously; failures enter visible retry/DLQ workflow.
6. Audit decision, source evidence, affected seller offers, and restoration path.

## Marketplace seller manager journey

- Review business identity, documents, representative, bank verification result, warehouse, agreement, risk flags, and related accounts under privacy rules.
- Approve, request information, reject, restrict category, suspend, reactivate, or close only with the matching permission and reason.
- Expiring documents create tasks and alerts before enforcement.
- Seller enforcement uses warning → temporary restriction → offer/category suspension → seller suspension → closure according to configured policy; emergency actions have post-review.

## Warehouse journey — Inbound to handoff

1. Authorized user creates/receives ASN; operator scans source, SKU, quantity, lot/serial/expiry when required.
2. Quality exceptions quarantine inventory instead of making it sellable.
3. Putaway task assigns zone/aisle/rack/shelf/bin; scan confirms location.
4. Confirmed order creates allocation/pick tasks. Operator scans location/item/serial and quantity.
5. Packing verifies order contents, chooses packaging, captures weight, prints slip/label, and seals package.
6. Shipping groups packages into courier manifest; both sides scan handoff and timestamp custody.
7. Inventory movements and shipment events publish atomically/outbox-backed; discrepancies enter exception queue.

Return receiving is isolated: receive RMA, scan serial, record condition/accessories/evidence, determine configured disposition, and trigger refund eligibility—not direct refund completion.

## Courier journey — Route, proof, and COD

1. Courier authenticates, syncs assigned route/packages/COD expected, and caches only minimum encrypted offline data.
2. At stop, courier may call/navigate without exposing data beyond operational need.
3. Courier records arrived, delivered, unavailable, refused, wrong address, reschedule, or return-to-depot. Amount and order totals are read-only.
4. Delivery requires configured proof: OTP, recipient name/signature, privacy-approved photo, time, and GPS confidence.
5. COD delivery records amount received; mismatch requires explicit reason and supervisor workflow.
6. Offline actions queue with client IDs and sequence; server validates assignment, version, geotime plausibility, and idempotency at sync.
7. Collected cash moves COLLECTED → AWAITING_REMITTANCE → REMITTED → RECONCILED or DISCREPANCY through controlled custody records.

## Customer service journey — Resolve without excess authority

1. Search by approved identifiers; ambiguous results stay masked until selected.
2. Open customer/order/ticket 360 timeline with role-filtered PII.
3. Diagnose using order, seller, payment, shipment, return, refund, notification, and audit-safe events.
4. Communicate using localized templates and case messages; internal notes never leak to customer.
5. Execute only low-risk granted actions. Financial/admin actions create an approval task or deep-link to authorized console.
6. Track SLA, waiting party, escalation, resolution code, customer message, and follow-up.

## Finance journey — Reconcile and settle

1. Import/receive provider settlement or courier remittance batch through idempotent adapter.
2. Match external line to internal payment/refund/COD collection using provider reference, amount, currency, order, and date tolerances.
3. Auto-match exact items; route missing/duplicate/amount/status conflicts to discrepancy case.
4. Authorized maker proposes correction/adjustment; separate checker approves material manual entries.
5. Settlement engine selects eligible immutable seller-ledger entries after delivery/return/hold rules and freezes batch snapshot.
6. Approval creates payout instruction through adapter; callbacks update payout state idempotently.
7. Statement, ledger entries, payout reference, withheld/disputed amounts, and reconciliation evidence remain linked.

## Fraud analyst journey

- Review explainable rule hits and linked evidence for customer/order/seller/payment/promo/review cases.
- Separate signal generation from adverse action. Analysts record decision/reason/evidence; protected or irrelevant traits are prohibited.
- COD manual review has deadline and safe default policy to avoid indefinite customer limbo.
- Rule changes are versioned, simulated against historical data, approved, feature-flagged, monitored, and rollbackable.

## Operations lead journey

- Monitor order/fulfillment/shipment/payment/COD/return queues, provider health, inventory anomalies, SLA breaches, and error budgets.
- Drill from aggregate to trace/correlation/entity without exposing unnecessary PII.
- Declare incident, select runbook, assign roles, record timeline/customer impact, apply feature flag or provider failover, and communicate status.
- Close only after recovery verification, reconciliation, backlog drain, customer remediation, and post-incident actions.

## Admin configuration journey

1. Draft versioned policy (COD, return window, commission, shipping rate, moderation, fraud threshold, template, warehouse, or feature flag).
2. Validate schema, scope, effective time, overlap, simulation/sample impact, and maker permission.
3. Checker approves high-risk changes; system records diff/reason and schedules activation.
4. Activation emits event and invalidates cache safely. Every decision uses the effective configuration version.
5. Rollback creates a new version; history is immutable.

## Segregation-of-duties requirements

- A payout creator cannot solely approve the same payout.
- A refund requester above threshold cannot solely approve it.
- A seller-reviewer cannot approve an entity where declared conflict exists.
- Support cannot edit ledgers, payment provider events, shipment proof, or audit logs.
- Warehouse cannot approve refunds or seller payouts.
- Courier cannot alter COD expected amount, order total, assignment history, or proof after finalization without supervised correction.
- Super-admin emergency access is MFA/step-up, time-bound, reasoned, alerted, and reviewed.
