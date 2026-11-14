# Testing Strategy

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

**Phase:** 0 — test architecture and release criteria  
**Status:** Draft; implementation follows architecture approval  
**Scope:** all nine applications, backend modules, data stores, events, provider adapters, infrastructure, security, privacy, operations, and financial controls

## 1. Quality objectives

Testing must establish more than “the screen works.” It provides evidence that:

- business state machines allow every valid transition and reject every invalid one;
- money, commissions, refunds, COD, and settlements are deterministic and reconcilable;
- inventory cannot oversell under realistic concurrency;
- retries, duplicate requests, callbacks, and events do not duplicate business effects;
- roles, tenants, sellers, customers, warehouses, couriers, and staff remain isolated;
- Arabic/French, RTL/LTR, mobile, accessibility, low bandwidth, and failure states are first-class;
- regulated disclosures, explicit confirmation, records, privacy rights, and audit evidence work end to end;
- external-provider latency, duplication, reordering, corruption, outage, and recovery are survivable;
- deploy, rollback, backup, restore, failover, reconciliation, and incident procedures are executable by the operating team.

No test suite can prove the product legally compliant or secure. It verifies that approved controls and requirements are implemented and remain effective.

## 2. Quality governance and ownership

| Layer                        | Primary owner                     | Independent evidence/reviewer                                          |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Unit, property, component    | engineer/domain team              | peer reviewer; coverage/mutation report                                |
| API/event/DB integration     | domain team + QA/SDET             | contract and integration pipeline                                      |
| Cross-domain journeys        | QA/SDET                           | product/operations UAT                                                 |
| Security/privacy             | security + DPO with domain teams  | independent penetration tester; Legal/DPO sign-off                     |
| Payments/finance/COD         | payments/finance engineering      | Finance/Accounting reconciliation sign-off; provider acceptance        |
| Performance/resilience       | SRE/platform + domain owners      | capacity/reliability review                                            |
| Accessibility/localization   | frontend/mobile QA + localization | native Arabic/French review; accessibility specialist before launch    |
| Disaster recovery/operations | SRE/on-call owners                | executive/business observer; post-exercise actions                     |
| Regulatory acceptance        | Legal/Compliance/DPO/Accounting   | qualified Algerian advisers/regulator/provider evidence where required |

Every requirement has a stable ID, risk, acceptance criteria, test IDs, owner, environment, automation status, evidence location, and release applicability. Critical manual tests are not “remembered”; they are scripted and signed.

## 3. Test portfolio

| Test type                | Purpose                                                                  | Default execution                                  |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------- |
| Static/type/schema       | Prevent invalid program/config/IaC states                                | local and every PR                                 |
| Unit                     | Pure rules, value objects, calculators, guards, mappings                 | local and every PR                                 |
| Property/model based     | Explore broad invariant/state space                                      | PR for changed domains; nightly extended           |
| Component                | Module through public interface with controlled dependencies             | every PR                                           |
| Database integration     | Constraints, transactions, locking, migrations, queries                  | every PR on disposable real PostgreSQL             |
| Adapter contract         | Marketplace/provider interface and recorded provider semantics           | PR against simulators; scheduled sandbox           |
| API contract             | OpenAPI request/response/error/auth/idempotency compatibility            | every PR                                           |
| Event contract           | Schema, compatibility, producer/consumer, idempotency, order assumptions | every PR                                           |
| Cross-domain integration | Transaction/outbox/queue/worker behavior                                 | every PR for affected flow; nightly full           |
| End to end               | User/operations outcome across deployed system                           | staging per release; smoke after deploy            |
| Visual/responsive        | Critical layouts and state regressions                                   | PR screenshots; staging device matrix              |
| Accessibility            | WCAG 2.2 AA automated and manual verification                            | component/PR plus release audit                    |
| Localization             | Arabic/French content, formatting, bidi/RTL, overflow                    | PR lint/snapshots; staging native review           |
| Security                 | SAST/SCA/DAST, authorization, abuse, penetration                         | PR/build/release/annual as appropriate             |
| Privacy/compliance       | notices, consent, rights, retention, records, evidence                   | release and policy change                          |
| Performance/load         | latency, throughput, resources, capacity, flash sale                     | baseline on main; full pre-release/campaign        |
| Resilience/chaos         | timeout, partial failure, retries, failover, recovery                    | staging scheduled; production-safe game days later |
| Migration/rollback       | compatibility and data integrity across versions                         | every schema/event change                          |
| Backup/DR                | restorability and reconciled recovery                                    | automated plus monthly/quarterly/full exercises    |

Production uses only non-destructive synthetic probes in dedicated canary tenants/accounts. Real money, real messages, seller payouts, or courier dispatches are never generated by an uncontrolled health check.

## 4. Test environments and data

Environment rules are defined in [18-infrastructure-and-deployment.md](./18-infrastructure-and-deployment.md).

### 4.1 Data principles

- Generated synthetic identities only; no copied production names, phones, emails, addresses, documents, messages, GPS, payment references, or logs.
- Algeria-aware fixtures include all supported wilayas/communes from the selected authoritative dataset, Arabic/French names, diacritics, long/short addresses, apartment/building details, and realistic DZD amounts—never real private identities.
- Deterministic factories expose seeds and scenario builders; tests do not share mutable global fixtures.
- Clocks, random IDs, provider responses, exchange of events, and working-day/holiday calendars are injectable/controllable.
- Financial fixture builders always declare currency, amount scale, tax/discount/shipping allocation, seller, fulfillment, and rounding policy.
- Document/media corpora contain valid, corrupted, oversized, spoofed-MIME, polyglot, malware-test, RTL, metadata-rich, and decompression-bomb-safe samples.
- Sensitive test credentials live in the test secret manager and rotate; source-controlled “test keys” cannot unlock a shared environment.
- Provider sandbox terms and test identifiers are documented; sandbox callbacks are unable to reach production endpoints.

### 4.2 Environment parity

Staging matches production architecture, configuration shape, TLS, authorization, queues, storage policies, telemetry, and deployment method, with reduced capacity and synthetic data. Differences are inventoried and risk reviewed. Provider fakes are required for deterministic failure tests, but certification also exercises the provider’s official sandbox/test process.

## 5. Domain test matrix

| Domain             | Required invariant/risk coverage                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity           | register/login/OTP/MFA/recovery/session rotation/reuse detection/revocation/rate limit/account deletion; no account enumeration                                    |
| Authorization      | every role × action × own/other tenant × state × amount/approval boundary; server enforcement and export coverage                                                  |
| Sellers            | onboarding states, document expiry, verification, rejection/reapply, delegation, suspension/reactivation, bank change hold                                         |
| Catalog/compliance | product vs offer, taxonomy-only category, required/dynamic attributes, variants, duplicates, prohibited hard block, compliance review, IP case, historic snapshots |
| Pricing/promotions | effective dates, eligibility, priority, stacking/incompatibility, caps, rounding, seller/marketplace funding, cancellation/refund allocation                       |
| Inventory          | on-hand/reserved/safety/available invariant, race for final unit, partial reserve, expiry/release, shipment decrement, adjustment/cycle count                      |
| Cart/checkout      | multi-seller grouping, stale price/stock, address/shipping validation, explicit review/confirmation, idempotent place-order, split atomicity                       |
| Orders             | marketplace/seller order relationship, item-level outcomes, controlled transitions, status history, partial delivery/cancel/return, immutable purchase snapshot    |
| Payments           | initiation, hosted redirect, pending/action, authenticated webhook, poll, duplicate/out-of-order event, capture/cancel/refund, timeouts, reconciliation            |
| COD                | risk reasons/override, OTP/call verification, frozen amount, refusal/failure, proof, collection, custody, remittance, deposit, discrepancy, refund                 |
| Shipping           | rating, split packages, labels/manifests, duplicate create, webhook ordering, tracking, provider outage, pickup/home, return-to-sender                             |
| Warehouse          | ASN/receive/putaway, location stock, pick scan, serial/IMEI uniqueness, pack/weight, manifest/handoff, cycle count, return inspection                              |
| Returns/refunds    | eligibility by policy snapshot, quantity/item isolation, evidence, approval/inspection/outcome, refund amount/method, restock/ledger effects                       |
| Reviews            | verified purchase, moderation, report/helpful, seller reply, no seller delete, media safety, order/item eligibility                                                |
| Finance            | double-entry/immutable ledger rules, commissions/fees, holds/reserves, statements, payout, adjustments, negative balances, close/reopen rules                      |
| Reconciliation     | payment/provider/bank, COD/courier/deposit, payout/bank, order/ledger/refund; exact match, tolerance policy, aging, discrepancy resolution                         |
| Notifications      | event/template/locale/preference, transactional vs marketing, consent/suppression, retry/dedup, invalid contact, provider failover                                 |
| Support            | tenant/data scope, ticket states/SLA, internal vs customer messages, attachments, sensitive action approval, complete order timeline                               |
| Search             | Arabic/French/English, analyzers/synonyms/transliteration, typo/prefix, facets, ranking, stale/delete, zero results, full rebuild, outage isolation                |
| CMS/SEO            | locale/version/schedule, safe content, preview/approval, canonical/structured data/sitemap/robots, no prohibited offer promotion                                   |
| Privacy            | notice/version, purpose/legal-basis record, consent/withdrawal, rights, deletion/hold, processing log, transfer block, retention job                               |
| Audit              | required actions, actor/reason/correlation, before/after policy, tamper evidence, clock/order, restricted access, export/restore                                   |

## 6. State-machine and model-based testing

Define executable models for:

- marketplace order;
- seller order/fulfillment order;
- inventory reservation;
- payment transaction;
- shipment and shipment attempt;
- return/RMA and inspection;
- refund;
- COD confirmation and cash reconciliation;
- seller onboarding/enforcement;
- seller settlement/payout;
- support case;
- catalog/compliance moderation.

For every state:

1. enumerate allowed commands and roles;
2. enumerate legal successor states and required guards;
3. assert illegal transitions return a stable error and make no side effect;
4. assert history includes previous/new state, actor/service, reason, timestamp, correlation, and metadata;
5. assert retries do not duplicate history/events/notifications/ledger entries;
6. assert entry/exit side effects occur once or are compensatable;
7. assert cancellation/return/refund affects only eligible items/quantities;
8. generate random command sequences and compare implementation state with the reference model.

Coverage is measured as `role × source state × command × guard outcome × target state`, not merely line coverage.

## 7. Financial correctness tests

### 7.1 Deterministic calculations

Property tests cover:

- sum of item, tax, discount, shipping, fee, and total components under the approved sign convention;
- allocations always sum exactly to the source amount with deterministic residual distribution;
- no binary floating point enters a monetary path;
- order snapshot remains unchanged after catalog/rule edits;
- refund never exceeds refundable captured/collected amount by item/payment;
- promotion/commission effective-date boundaries and time zones;
- identical input and rule version produce identical result;
- Arabic/French formatting cannot change stored numeric value.

### 7.2 Ledger and settlement

- Every business event produces the expected balanced/set of immutable ledger entries.
- Duplicate event cannot create a second entry because of a database uniqueness rule.
- Corrections use reversal/adjustment; history cannot be overwritten.
- Seller `pending + available + reserved + paid/settled` views reconcile to ledger sources under the approved model.
- Partial cancellation/return/refund adjusts only attributed commission, discounts, fees, tax, and seller proceeds.
- Settlement cutoff, hold, reserve, dispute, negative balance, bank destination change, failed payout, and retry are boundary tested.
- Generated statements reproduce from the ledger and match API/export/PDF values.

### 7.3 Reconciliation

Use generated provider/courier/bank files with missing, duplicate, late, reordered, partial, extra, malformed, wrong-currency, wrong-amount, and ambiguous records. Assert:

- matches are deterministic and explainable;
- automatic match never hides a discrepancy outside approved rules;
- one external record cannot settle two internal transactions;
- manual resolution is maker/checker, reasoned, audited, and reversible through adjustment;
- aging/threshold alerts fire;
- close totals equal source totals and unresolved amounts.

## 8. Concurrency and idempotency

Mandatory controlled race tests:

- two or more customers buy the final unit;
- two tabs/devices submit the same and different checkout idempotency key;
- price/stock/promotion changes between cart, quote, and confirm;
- payment callback arrives twice, before redirect, after polling, after cancel, and out of order;
- courier create/webhook is duplicated and reordered;
- return/refund worker runs twice or crashes after provider success before local commit;
- seller edits stock while reservation/ship/cancel executes;
- two staff approve the same refund/settlement;
- bank destination changes while payout batch is prepared/released;
- event is delivered after consumer processed a later aggregate version;
- outbox publisher crashes before/after publish/mark-sent;
- retry happens after request timeout while original succeeds.

Each test asserts database constraints, final state, number of external calls, events, notifications, ledger entries, inventory units, and audit rows—not only the HTTP response.

## 9. API and event contract testing

### APIs

- OpenAPI is linted and used to generate validation/contract tests.
- Breaking changes are detected: removed/renamed fields, narrowed values, changed requiredness, error/status/auth/rate/idempotency semantics.
- Every endpoint has positive, validation, unauthenticated, unauthorized, wrong-tenant, not-found without leakage, conflict/state, limit, and dependency-failure tests.
- Mutation tests cover missing/reused/mismatched idempotency keys where required.
- Stable public error codes are verified in Arabic and French; internal exception material is absent.
- Pagination tests cover stable ordering, cursor tamper, duplicates/gaps during writes, and maximum bounds.

### Events

- Versioned schema validation runs for producer and consumers.
- Backward/forward compatibility follows the catalogued policy; unknown optional fields are tolerated, unknown semantic versions are quarantined.
- Consumer-driven contracts cover required business meaning, not merely JSON shape.
- Duplicate, delay, reorder, poison message, schema mismatch, consumer crash, DLQ, and replay are exercised.
- Event payload data classification/minimization is asserted; restricted fields fail a policy test.

## 10. Provider adapter testing

Each payment, courier, SMS, email, push, maps, storage, and search adapter ships with a programmable simulator capable of:

- success, pending, rejection, timeout, connection reset, malformed body, invalid signature/certificate, clock skew;
- 4xx/5xx and documented provider codes;
- rate limit and retry-after;
- duplicate and out-of-order callbacks;
- delayed callback after client abandonment;
- provider success followed by local crash;
- partial batch success;
- status drift between callback, poll, and reconciliation file;
- key/certificate rotation;
- maintenance window and sustained outage.

Official provider sandbox/certification tests complement—not replace—the simulator. Production enablement requires contract mapping, provider security/legal approval, sandbox evidence, callback authenticity, reconciliation rehearsal, and disable/rollback procedure.

## 11. End-to-end journey suites

### Customer

1. Select Arabic/French and location; verify RTL/LTR and localized DZD/date/address.
2. Register, verify, log in, recover, view/revoke session.
3. Search by Arabic/French, typo, transliteration; filter/sort; view offer/seller/terms.
4. Add multi-seller/multi-fulfillment items; mutate quantity; apply valid/invalid promotion.
5. Address → per-group shipping → COD or provider sandbox → review/correct → explicit confirmation.
6. Verify marketplace order split, reservation, contract copy, invoice route, notifications, and tracking.
7. Cancel one eligible item; other seller items continue.
8. Receive split shipments; delivery evidence and COD collection/reconciliation appear correctly.
9. Request item-level return with evidence; approval, courier, receipt, inspection, refund, ledger adjustment, notifications.
10. Review only delivered purchased item; manage privacy/marketing preferences and data-rights request.

### Seller

1. Register with MFA; complete legal/business/document/bank/warehouse onboarding; review/rejection/correction/approval.
2. Find master product/create offer or submit new-product request; variant, price, stock, shipping, warranty, media, moderation.
3. Receive only own order; accept/prepare/serial/label/handoff; handle cancellation/return/dispute.
4. View performance, ledger, statement, upcoming/completed settlement; change bank destination through protected workflow.
5. Delegate user with limited role; prove cross-seller isolation and revocation.

### Admin/support/warehouse/courier/finance

- approve/reject/suspend seller with reason/audit;
- moderate product and prohibited-category attempt;
- support resolves order issue without excess data or unapproved refund;
- warehouse receives, puts away, reserves, picks, packs, serial-validates, manifests, receives return, inspects;
- courier syncs assignment, navigates/calls through approved controls, records attempt/delivery/COD, works through offline/retry without duplicate;
- finance reconciles payment, COD, refund, seller ledger and payout, resolving a discrepancy with maker/checker.

Each E2E case asserts customer-facing state, owned domain state, event/audit/notification records, money/inventory outcome, telemetry, and no unrelated tenant effect.

## 12. Frontend, mobile, localization, and accessibility

### Device/responsive matrix

- 320, 360, and 390 CSS-pixel mobile widths;
- representative Android/iOS devices and supported OS/browser versions;
- tablet, laptop, desktop, and large display;
- touch, keyboard-only, screen reader, reduced motion, zoom/reflow to 400%, high contrast where supported;
- slow/unstable mobile network, offline transition, stale cache, app background/kill/restart.

### Arabic/French/i18n

- Full `dir=rtl`/`ltr` behavior, logical CSS properties, mirrored navigation/icons only when semantically correct.
- Mixed Arabic/Latin SKU, phone, order ID, currency, URL, and address text resists bidi confusion and remains copyable.
- No concatenated translated fragments; plural, gender/context, interpolation, punctuation, and truncation reviewed.
- DZD, dates, numbers, Wilaya/Commune and phone display are localized but API/storage formats remain unambiguous.
- Pseudolocalization catches hard-coded strings and expansion; untranslated-key test fails release.
- Legal/policy translations share version identity and approved meaning.

### Accessibility

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) where applicable. Automated scanning is supplemented by manual keyboard, focus, screen-reader, zoom/reflow, form/error, dialog, table, dynamic status, OTP, drag alternative, target size, and accessible-authentication testing. Critical flows—auth, search, product, cart, checkout, orders, return, support, seller/admin work—must pass with no open blocker/critical accessibility issue.

## 13. Security and privacy verification

Follow [17-security-architecture.md](./17-security-architecture.md) and the OWASP ASVS 5.0.0 profile.

Automated:

- secret, SAST, SCA/licence, container, IaC and SBOM scans;
- authenticated DAST and API fuzz/schema-negative tests;
- authorization/IDOR/cross-tenant regression;
- rate-limit, lockout/abuse, CSRF/CORS/CSP/header, injection, XSS/template, SSRF/egress, path/file, unsafe deserialization tests;
- upload MIME/polyglot/malware/quarantine/access tests;
- token/session/refresh rotation/reuse/revocation and webhook signature/replay tests;
- sensitive-data pattern checks against logs, traces, metrics, errors, analytics, exports, URLs, browser storage, mobile cache.

Manual/independent:

- threat-model review for each critical domain;
- abuse cases for seller/customer/support/finance/courier collusion or takeover;
- independent web/API/mobile/infrastructure penetration test and retest before launch;
- cloud/hosting/IaC and production-access review;
- payment integration/responsibility review;
- privacy assessment of profiling, GPS, identity documents, evidence, analytics, notifications, transfers, rights/deletion;
- incident tabletop and evidence-preservation exercise.

No Critical or High finding may remain open at launch absent the exceptional governance described in the security architecture; authorization, payment, data-exposure, and financial-integrity Highs are not normal waiver candidates.

## 14. Algeria compliance tests

Map each item in [16-algeria-compliance-checklist.md](./16-algeria-compliance-checklist.md) to automated/manual evidence. Minimum test packs:

- seller/platform identity disclosure on product, cart, checkout, contract, invoice, and complaint views;
- `.com.dz`, TLS/site-authentication evidence and approved Algeria-hosted production locations;
- prohibited category cannot publish, search, advertise, cart, checkout, pay, or notify through any API/import/admin path;
- offer completeness, TTC totals, availability, delivery, warranty, return/refund, payment and complaint details;
- checkout terms → review/correct/cancel → explicit confirmation; no order on render/refresh/back/retry;
- immutable electronic contract copy and correct invoice/delivery/return acknowledgements;
- record package integrity and CNRC monthly export field/reconciliation/submission rehearsal;
- ANPDP processing inventory/filing evidence; notice, consent/legal basis, rights, rectification timer, withdrawal/marketing suppression, transfer block, retention/deletion;
- Law 25-11 DPO/contact, processing register, automated operation-log completeness and access protection;
- cash/COD disabled for categories required to use non-cash banking/financial circuits under the approved legal interpretation;
- CIB/payment provider certification, callback, payment receipt, refund, reconciliation and no sensitive card data;
- Arabic/French counsel-approved policy versions and exact version captured at contract.

Tests verify the approved interpretation; Legal/DPO/Accounting approve the interpretation.

## 15. Performance, capacity, and reliability

### 15.1 Initial user-facing budgets

These are launch engineering targets, not legal promises; refine with the capacity model:

| Interaction                  | Target under forecast peak                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cached public/API reads      | p95 ≤ 300 ms, p99 ≤ 800 ms server time                                                                               |
| Catalog/product/cart API     | p95 ≤ 500 ms, p99 ≤ 1.2 s server time                                                                                |
| Search API                   | p95 ≤ 800 ms, p99 ≤ 1.5 s                                                                                            |
| Checkout quote/review        | p95 ≤ 1.2 s excluding third-party time                                                                               |
| Place order                  | p95 ≤ 1.5 s to durable accepted/committed outcome excluding required provider interaction                            |
| Webhook acknowledgement      | p95 ≤ 500 ms after authentication/persistence, with asynchronous business processing where supported                 |
| Customer web Core Web Vitals | p75 LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on defined mobile profile                                                   |
| Error rate                   | < 1% total and < 0.1% unexpected 5xx for core APIs during steady load; stricter SLO accounting applies in operations |

Do not optimize a percentile by dropping slow errors. Results report successes/errors separately and include database, queue, provider, network, client, and resource saturation.

### 15.2 Workload profiles

- baseline and forecast peak mix;
- step and sustained peak;
- flash-sale burst and hot product/SKU;
- search autocomplete/facets and zero-result analytics;
- checkout/inventory contention;
- provider callback burst after outage;
- notification fan-out;
- seller bulk import/media processing;
- finance/CNRC report and settlement batch;
- queue catch-up after dependency recovery;
- 8–24 hour soak for leak/fragmentation/backlog drift;
- fail one application/data/broker/search failure domain during load.

Success requires latency/error/SLO, resource headroom, no invariant breach, bounded queue catch-up, database replication/lock health, and exact financial/inventory reconciliation.

## 16. Resilience and failure injection

In a production-like staging environment inject:

- network latency, loss, reset, DNS failure, stale DNS, expired/rotated certificate;
- provider 429/5xx/timeout/partial outage and recovery burst;
- application replica kill and rolling node loss;
- database connection exhaustion, slow query, lock contention, primary failover, replica lag;
- Redis loss/eviction;
- broker node loss, consumer pause, poison message, DLQ/replay;
- search node/index failure and full rebuild;
- object store slow/unavailable/quota and malware scanner failure;
- telemetry backend/collector loss without application outage;
- disk/CPU/memory pressure and clock skew;
- backup/control credential unavailability and restore from immutable copy.

Every experiment has hypothesis, safety boundary, abort, expected alerts, on-call/runbook action, data-integrity check, and learning. Chaos is not unbounded random destruction.

## 17. Migration, rollback, backup, and DR testing

For every migration:

- fresh install and upgrade from every supported prior version;
- production-scale copy generated from synthetic distributions;
- old app/new schema and new app/old-expanded schema compatibility;
- resume after interruption; repeat safety; concurrent traffic; lock/WAL/disk/replication impact;
- rollback/forward-fix rehearsal and post-migration reconciliation.

Recovery tests verify application outcomes, not only database startup:

- restore identities/permissions/config/secrets/certificates/IaC state;
- order/payment/refund/ledger/inventory/COD reconciliation at the recovery point;
- queue/outbox/inbox replay without duplicate effects;
- object/contract/invoice integrity and access;
- search rebuild and alias switch;
- provider status reconciliation for the outage gap;
- DNS/traffic cutover and client/mobile retry behavior;
- measured RPO/RTO compared with approved targets.

## 18. Pipeline and test execution

### Developer/PR, target ≤ 15 minutes for the blocking fast path

- formatting/lint/type/schema;
- affected unit/property/component tests;
- disposable PostgreSQL integration and migration checks;
- API/event compatibility;
- authorization negatives for changed endpoints;
- security/supply-chain/IaC scans;
- build and critical UI accessibility/visual checks.

Longer suites may run in parallel but must complete before merge for high-risk changes.

### Main/nightly

- full unit/component/integration/contract suite;
- expanded property/model/fuzz/concurrency;
- E2E matrix, localization/RTL, accessibility scan;
- DAST, provider failure suite, queue replay;
- performance trend baseline and flaky-test analysis.

### Release candidate/staging

- full critical journeys by application/role;
- provider sandbox/certification packs;
- load/soak/resilience for material changes;
- migration/rollback, backup restore, synthetic monitoring, alert/runbook validation;
- legal/privacy/finance evidence and manual UAT;
- mobile supported-version/device matrix;
- independent security/accessibility testing at launch and material changes.

### Post-deploy

- read-only/internally scoped smoke;
- synthetic canary journey in a dedicated test tenant;
- SLO, error, security, queue, DB, provider, business-invariant and reconciliation dashboards;
- automatic progressive-delivery abort on declared thresholds.

## 19. Coverage, mutation, and flakiness policy

- Changed domain code requires meaningful branch/invariant coverage; aggregate percentage cannot hide an untested critical module.
- Initial automated threshold: ≥ 80% line and branch coverage for domain/application code, with 100% enumerated state-transition and money-calculation rules. Generated, framework, and trivial wiring exclusions are explicit.
- Mutation testing is required for pricing, promotions, commission, inventory, order/payment/return/refund states, ledger/settlement, authorization guards, and idempotency. Surviving critical mutants are triaged like missing tests.
- A flaky test is a defect. Quarantine requires owner, issue, reason, risk, expiry, and replacement gate; critical journey/security/financial tests cannot simply be ignored.
- Test runtime, failure reason, retry count, owner, environment, and artifacts are retained for trend analysis.

## 20. Defect and release gates

| Severity      | Definition                                                                                                                                                                       | Release rule                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `S0 Critical` | data/tenant breach, unauthorized money/admin action, systemic corruption/loss, duplicate charge/payout, prohibited goods purchasable, no recovery, launch-blocking legal failure | Stop; no release; incident handling if deployed                                               |
| `S1 High`     | core journey unusable at scale, material financial/inventory mismatch, auth/authorization weakness, critical accessibility blocker, RPO/RTO failure                              | No release without exceptional executive + Security/Legal/owner decision; normally fix/retest |
| `S2 Medium`   | significant degraded path with safe workaround and no integrity/security/legal breach                                                                                            | Risk-based release decision with owner/date and monitoring                                    |
| `S3 Low`      | minor cosmetic/content/low-impact issue                                                                                                                                          | Backlog with normal prioritization                                                            |

Release requires:

- 100% passing critical automated tests and signed manual scripts;
- no unresolved S0; no unresolved S1 without extraordinary approved exception;
- required provider certification and financial reconciliation;
- compliance evidence linked and approved;
- performance/resilience within budgets and capacity headroom;
- rollback, backup/restore, alerts, dashboards, and runbooks validated;
- known defects, changes, config/flag state, and support communications documented.

## 21. Test evidence schema

Each release evidence item records:

```text
requirement/control/test IDs
release and immutable artifact digest
environment and configuration/feature flags
test data seed/scenario
time and executor/tool version
expected and actual outcome
logs/screenshots/traces/reconciliation artifacts with personal data removed
defect/risk-exception links
reviewer and approval
retention/classification
```

Evidence itself follows the approved Algeria-hosting, privacy, security, and retention rules.

## 22. References

- [OWASP Application Security Verification Standard 5.0.0](https://owasp.org/projects/asvs)
- [OWASP Top 10:2025](https://top10.owasp.org/2025/en/)
- [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/)
- [NIST SP 800-63 Revision 4 implementation resources](https://pages.nist.gov/800-63-4-Implementation-Resources/index.html)
- [NIST SP 800-61 Rev. 3 — Incident Response](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

The final test inventory must be generated from the approved screen, API, event, notification, error, permission, lifecycle, and compliance catalogs. Architecture approval is the prerequisite for implementing this strategy.
