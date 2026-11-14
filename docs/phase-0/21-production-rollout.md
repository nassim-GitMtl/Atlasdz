# Production Rollout Plan

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

**Phase:** architecture and release planning under the seller-fulfilled scope  
**Status:** safe implementation authorized; applicable rollout evidence and specialist decisions pending  
**Scope amended:** 2026-10-06; historical detailed rollout baseline dated 2026-10-02  
**Applies to:** seller-fulfilled Customer Web, Seller Center, and Marketplace Admin/Support; excluded warehouse, fleet, cash-custody, and unconditional settlement gates below are historical

This document defines the controlled path from approved architecture to general availability. It is not a launch authorization. Production launch requires explicit sign-off from product, engineering, security, operations, finance, and qualified Algerian legal/accounting reviewers. Any rollout percentages, cohort sizes, recovery objectives, or timing below are provisional until owners validate them against real capacity and risk.

## 1. Rollout principles

1. **Follow current scope authority.** ADR-011 authorizes safe implementation and testing. Real commercial onboarding, provider activation, and deployment require the applicable evidence and authorization.
2. **Evidence over confidence.** Each gate has named evidence, an accountable approver, and a recorded decision.
3. **No irreversible cutover.** Features, providers, and cohorts must be independently controllable; database changes follow expand–migrate–contract; destructive migrations are prohibited during launch windows.
4. **Correctness before growth.** Order, reservation, seller-routing, delivery-evidence, and applicable payment/refund/fee records must reconcile before traffic expands. Platform payouts and COD custody are not assumed.
5. **Privacy and legal readiness are launch blockers.** Legal/accounting review, personal-data governance, required registrations/filings, seller disclosures, prohibited-category controls, and records obligations must be closed or formally accepted by the authorized owner.
6. **Degrade safely.** When a dependency fails, the platform should preserve confirmed orders and financial evidence, stop unsafe mutations, and communicate clearly rather than silently corrupting state.
7. **Small cohorts first.** Start with controlled users, sellers, products, locations, couriers, and payment methods; increase one dimension at a time.
8. **Rollback is a product capability.** Rollback and kill switches are tested before each feature reaches a broader cohort.

Related controls are defined in the [Algeria compliance checklist](./16-algeria-compliance-checklist.md), [security architecture](./17-security-architecture.md), [infrastructure and deployment plan](./18-infrastructure-and-deployment.md), [testing strategy](./19-testing-strategy.md), and [observability and operations plan](./20-observability-and-operations.md).

## 2. Decision ownership

| Decision area                                 | Accountable owner   | Required participants                                                         | Veto authority                                                                                            |
| --------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Architecture approval                         | CTO                 | Principal engineering, product, security, operations, data                    | CTO, security lead                                                                                        |
| Algeria legal/compliance readiness            | Executive sponsor   | Qualified Algerian counsel, privacy lead, compliance, product                 | Qualified counsel / executive sponsor                                                                     |
| Accounting, tax, invoicing, seller settlement | CFO or finance lead | Qualified Algerian accountant/tax adviser, marketplace finance, engineering   | CFO                                                                                                       |
| Security and privacy readiness                | Security lead       | Privacy lead/DPO if appointed, engineering, operations                        | Security lead                                                                                             |
| Reliability and disaster recovery             | Operations/SRE lead | Engineering, database owner, security                                         | Operations/SRE lead                                                                                       |
| Product and accessibility readiness           | Product lead        | Design, research, support, QA, localization                                   | Product lead                                                                                              |
| Payment and COD readiness                     | Finance lead        | Payments engineering, operations, support, couriers, provider representatives | Finance lead                                                                                              |
| Go/no-go at each rollout step                 | Launch commander    | All accountable owners above                                                  | Any accountable owner may hold; executive sponsor resolves only after the risk owner documents acceptance |

The launch commander coordinates the decision but cannot waive a specialist gate. Sign-offs, exceptions, expiry dates, compensating controls, and supporting artifacts belong in the release decision record.

## 3. Non-negotiable launch gates

### 3.1 Phase 0 architecture gate

- [ ] All Phase 0 documents are reviewed as one coherent system.
- [ ] Domain boundaries, ownership, state machines, API/event contracts, idempotency model, ledger model, and authorization model are approved.
- [ ] Build-versus-buy and provider-neutral adapter decisions are recorded.
- [ ] Open decisions have owners and due dates; no unresolved item can silently become an implementation assumption.
- [ ] Architecture decision is recorded as **approved**, **approved with time-bound conditions**, or **rejected**.

**Release condition:** verify applicable architecture and release evidence before production activation. Safe application implementation and local testing continue under the owner's ADR-011 authorization; no production-resource authorization is implied.

### 3.2 Legal, regulatory, and accounting gate

- [ ] Qualified Algerian counsel confirms the applicability and implementation of Law 18-05, Law 18-07 as amended, Executive Decree 19-89, and other applicable consumer, advertising, electronic-signature/trust-service, sector, and marketplace rules.
- [ ] Legal entity, commercial-register/artisan-register, national e-supplier-file, Algeria-hosting, and `.com.dz` requirements are validated and completed where applicable.
- [ ] ANPDP declaration/authorization and international-transfer requirements are mapped to actual processing and completed where required.
- [ ] A privacy lead/DPO decision is documented; notices, rights workflows, processor terms, processing records, and breach procedures are approved.
- [ ] Prohibited and restricted categories, seller eligibility, listing evidence, takedown, recall, and authority-response procedures are approved.
- [ ] Mandatory pre-contract disclosures, order confirmation, invoice/equivalent, delivery/return evidence, and required CNRC reporting are validated.
- [ ] Qualified accounting/tax advisers approve tax, commission, seller payout, refunds, invoice/credit-note, COD, record-retention, and ledger treatment.
- [ ] Payment-service-provider licensing and fund-flow analysis confirms the platform does not perform an unauthorized regulated payment or custody activity.
- [ ] Legal copies in Arabic and French are reviewed; language precedence and evidence of user acceptance are defined.

No checklist item is a legal conclusion. Interpretations and obligations must be validated against the exact entity, products, payment flow, providers, and launch date.

### 3.3 Security and privacy gate

- [ ] Threat model and abuse cases are current for the release scope.
- [ ] MFA, least privilege, separation of duties, privileged-access review, session controls, and break-glass procedure are tested.
- [ ] Secret, key, and certificate inventories have named owners and tested rotation paths.
- [ ] SAST, dependency, container, infrastructure-as-code, secret, and DAST scans meet the approved severity policy.
- [ ] Independent penetration testing covers internet-facing, seller, operator, support, finance, and mobile surfaces; critical/high findings are closed or formally risk-accepted with short expiry dates.
- [ ] Payment integrations use provider-hosted/tokenized flows; no prohibited raw card data appears in application storage, logs, analytics, support tools, or backups.
- [ ] Audit events are immutable/tamper-evident, access-controlled, time-synchronized, queryable, and sampled end to end.
- [ ] Privacy-safe telemetry tests show that secrets, passwords, tokens, payment credentials, identity-document content, and unnecessary personal data are excluded.
- [ ] Incident response and personal-data-incident exercises have completed action items.

### 3.4 Product, content, and accessibility gate

- [ ] Critical journeys work in Arabic RTL and French on agreed browser/device matrices and low-bandwidth profiles.
- [ ] Pricing, fees, taxes, availability, delivery estimates, seller identity, payment method, cancellation/return rules, and final order confirmation are clear before commitment.
- [ ] Accessibility acceptance criteria meet the approved target, with [WCAG 2.2](https://www.w3.org/TR/WCAG22/) used as the technical reference.
- [ ] Empty, loading, offline, timeout, duplicate-action, partial-failure, and recovery states are usable.
- [ ] Search and merchandising cannot surface blocked, recalled, inactive, or unavailable offers.
- [ ] Customer, seller, support, operations, warehouse, courier, finance, and administration role journeys have named acceptance owners.
- [ ] Legal, transactional, and support content has controlled versions, approval history, effective dates, and rollback capability.

### 3.5 Data and catalog gate

- [ ] Seller identity, permissions, bank/payout data, and required evidence are validated under the approved onboarding procedure.
- [ ] Pilot offers have complete taxonomy, attributes, seller ownership, price, tax treatment, inventory source, fulfillment promise, prohibited-category status, and media rights.
- [ ] Import validation rejects duplicates, impossible prices, invalid identifiers, malformed translations, missing evidence, and unknown category mappings.
- [ ] Search index, caches, projections, and analytical views can be rebuilt from authoritative stores.
- [ ] Production data migration has reconciliation totals, rejected-row handling, owner approval, and a tested restore path.
- [ ] Test accounts and synthetic fixtures are unmistakably labeled and excluded from settlement, regulatory reports, analytics, and customer communications.

### 3.6 Payments, finance, and COD gate

- [ ] Each electronic-payment adapter passes provider certification/approval and production credential checks where required.
- [ ] Authorization, capture, failure, timeout, webhook retry, duplicate webhook, refund, partial refund, reversal, and dispute flows are reconciled in provider sandboxes and production-like tests.
- [ ] Provider events are authenticated, deduplicated, retained, and correlated to internal payment attempts.
- [ ] The immutable double-entry ledger balances at account, seller, order, payment, refund, payout, and period levels.
- [ ] Seller commissions, reserves, payout holds, statements, and adjustments are reproducible from ledger entries.
- [ ] COD manifests, handoff, collection, remittance, discrepancy, loss, return-to-origin, and courier settlement workflows have dual-control rules and evidence.
- [ ] Daily reconciliation can identify missing, duplicate, late, or mismatched provider/courier entries without rewriting history.
- [ ] Finance signs a zero-unexplained-difference rehearsal or a formally approved materiality threshold with named remediation.
- [ ] Non-cash restrictions for applicable categories are enforced after qualified legal/accounting confirmation.

### 3.7 Reliability and operational gate

- [ ] Capacity tests meet the approved peak model with safety margin.
- [ ] Service-level indicators, dashboards, alerts, and synthetic checks are active before user traffic.
- [ ] On-call rotations, escalation contacts, provider contacts, and incident roles cover the entire launch window.
- [ ] Payment, COD, order, inventory, database, queue, search, notification, courier, security, privacy, and disaster-recovery runbooks are exercised.
- [ ] Backup restoration meets approved RPO/RTO for PostgreSQL, object storage, search rebuild, configuration, secrets metadata, and audit evidence.
- [ ] Queue replay, poison-message quarantine, idempotent retry, and reconciliation jobs are tested.
- [ ] Provider fallback and customer-facing degradation modes work without creating duplicate orders or ambiguous payment state.
- [ ] Support macros, escalation paths, known-issue guidance, refund authority, and fraud escalation are ready in Arabic and French.

## 4. Rollout stages

Advancing a stage requires the prior stage’s evidence, a recorded go/no-go decision, and no active stop condition. Cohort sizes are starting proposals, not commitments.

| Stage                           | Exposure                                                                                                              | Purpose                                                                                                                          | Minimum hold                                                | Exit criteria                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0. Architecture approval        | No production users                                                                                                   | Approve the Phase 0 blueprint and decision log                                                                                   | Until approval                                              | Section 3.1 signed; implementation authorized                                     |
| 1. Integrated release candidate | Non-production; synthetic data                                                                                        | Prove contracts, state machines, integrations, migrations, security controls, and test automation                                | Two clean pipeline runs plus remediation                    | All non-production gates meet policy; no unresolved release-blocking defect       |
| 2. Full dress rehearsal         | Production-like environment; trained staff                                                                            | Rehearse deployment, rollback, restore, reconciliation, support, incident response, and legal evidence                           | One complete order-to-settlement cycle                      | Timings and results recorded; action items closed or accepted                     |
| 3. Dark production              | Production services, no public ordering                                                                               | Validate infrastructure, routing, certificates, telemetry, provider reachability, jobs, and data paths without exposing checkout | At least 24 hours of representative synthetic checks        | Stable SLOs; no unintended external messages or financial movement                |
| 4. Closed operational pilot     | Employees/approved testers; a few approved sellers, SKUs, fulfillment nodes, couriers, locations, and payment methods | Validate real operations and end-to-end evidence under strict caps                                                               | At least 3 business days and complete reconciliation        | No unexplained financial differences; support/ops defects within threshold        |
| 5. Limited customer pilot       | Invitation-only or tightly bounded public cohort; one defined geography and capacity cap                              | Test customer behavior, delivery promises, returns, refunds, fraud, and support load                                             | At least 7 days, including one settlement cycle             | SLOs and business guardrails sustained; no open severity-1/2 issue                |
| 6. Public canary                | Suggested 1% → 5% → 25% → 50% → 100% of the approved launch cohort                                                    | Increase traffic while preserving rapid rollback                                                                                 | One peak period and reconciliation checkpoint per step      | Each step stays within technical, financial, customer, and operational thresholds |
| 7. Controlled expansion         | Add one dimension at a time: wilaya, seller cohort, category, courier, warehouse, or payment method                   | Grow while attributing failures to a bounded change                                                                              | At least one peak and settlement/return cycle per dimension | Stable metrics and capacity; training and supply readiness confirmed              |
| 8. General availability         | Approved national scope                                                                                               | Operate as a normal production service                                                                                           | 30-day hypercare recommended                                | Hypercare exit criteria met and residual risks transferred to BAU owners          |

The team must not treat elapsed time as evidence. Low traffic, missing settlement cycles, or unexercised return/refund paths extend the hold.

## 5. Cohort design and exposure controls

Every rollout unit must be targetable by a combination of:

- account and role;
- seller and offer;
- category and restricted-category status;
- wilaya/commune/postal coverage;
- warehouse or fulfillment node;
- courier/service level;
- payment method/provider;
- client platform and version;
- feature flag and experiment assignment.

Feature flags must have an owner, purpose, scope, default, creation date, expiry/review date, audit history, and tested off-path. Authorization, legal obligations, pricing truth, ledger invariants, or prohibited-category enforcement must never depend solely on a client-side flag.

### 5.1 Required kill switches

- checkout globally, by seller, offer, category, geography, or fulfillment node;
- a payment method or provider, while preserving status lookup and reconciliation;
- COD acceptance by geography, courier, seller, customer-risk tier, or value threshold;
- seller listing publication and seller payout initiation;
- promotion/coupon issuance and redemption;
- courier assignment and new shipment creation;
- customer notifications by channel/template;
- indexing of new/changed offers;
- bulk import and administrative mutations;
- outbound webhooks and risky third-party integrations.

Kill switches default to fail-safe states, are protected by MFA and least privilege, produce high-fidelity audit events, and require periodic drills.

## 6. Cutover runbook

### 6.1 Seven to fourteen days before exposure

- Freeze the release scope and record exact versions, migrations, flags, providers, cohorts, and known risks.
- Confirm all gate evidence and approval meetings.
- Validate production DNS, `.com.dz`, certificates, Algeria-hosting design, WAF/CDN behavior, email/SMS sender identities, and provider allowlists.
- Rotate temporary setup credentials; verify secret expiry alerts.
- Load only approved sellers, offers, inventory, taxonomy, content, legal versions, configuration, and routing rules.
- Establish baseline performance, error, fraud, reconciliation, support, and delivery metrics.
- Restore current backups into an isolated environment and record achieved RPO/RTO.
- Run the full dress rehearsal and a tabletop rollback.

### 6.2 Twenty-four hours before exposure

- Enforce the change freeze except launch-command-approved emergency changes.
- Confirm on-call coverage, bridge details, executive/legal/security contacts, and provider escalation channels.
- Verify dashboards, paging routes, status communications, support queues, and incident templates.
- Run database integrity, migration status, ledger balance, queue depth, search parity, inventory parity, and reconciliation checks.
- Confirm all public content, prices, fees, policies, seller disclosures, contact points, and Arabic/French rendering.
- Record the go/no-go evidence snapshot and the final rollback deadline.

### 6.3 Exposure start

1. Announce the launch window internally and open the incident/decision log.
2. Deploy with public ordering disabled.
3. Run health, synthetic journey, authorization, audit, and dependency checks.
4. Enable the smallest approved cohort and confirm routing/flag assignment.
5. Complete one real or legally approved controlled order per enabled payment/fulfillment route.
6. Verify order, payment, inventory, shipment, notification, invoice, audit, and ledger evidence.
7. Hold for the stage-specific observation and reconciliation period.
8. Expand only after the launch commander records all required approvals.

### 6.4 End of each launch day

- Reconcile orders, payments, refunds, commissions, payouts, COD, provider reports, courier reports, ledger accounts, and bank/financial evidence available for the period.
- Review SLOs, alert noise, security signals, fraud, stock mismatches, cancellations, returns, late deliveries, customer contacts, and accessibility/localization issues.
- Record cohort composition, flags, versions, incidents, mitigations, decisions, and unresolved risks.
- Decide: continue unchanged, expand, contract, disable a path, roll back, or stop.

## 7. Go/no-go scorecard

Owners set numeric thresholds before Stage 3 using capacity forecasts and test baselines. Thresholds cannot be invented during an incident.

| Dimension             | Example evidence                                                                             | Hold/rollback condition                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Safety/security       | WAF/identity signals, privileged activity, vulnerability status                              | Suspected compromise, privilege bypass, secret exposure, or uncontrolled abuse                             |
| Legal/privacy         | Required filings, notices, consent/contract versions, rights queue, prohibited-content queue | Missing required authorization/disclosure, unlawful processing concern, or material prohibited listing     |
| Order correctness     | State-transition errors, orphan orders, duplicate orders, price/tax/fee mismatches           | Any systemic invariant breach or unexplained duplicate financial commitment                                |
| Payments              | Success by provider, unknown/pending age, duplicate events, reconciliation delta             | Unbounded unknown states, unauthenticated events, systemic duplicate charge, or unexplained material delta |
| Ledger/settlement     | Trial balance, seller subledger, refund/payout aging                                         | Ledger out of balance, unreproducible seller balance, or unauthorized payout risk                          |
| COD                   | Handoff/collection/remittance parity, discrepancy aging                                      | Missing custody evidence, systemic discrepancy, or uncontrolled cash exposure                              |
| Inventory/fulfillment | Oversell rate, reservation failures, promise accuracy, stuck shipments                       | Systemic oversell, lost custody, or delivery promises no longer credible                                   |
| Reliability           | Availability, latency, error rate, saturation, queue lag                                     | SLO burn exceeds launch policy or capacity margin is exhausted                                             |
| Customer experience   | Checkout completion, cancellation, contacts/order, complaint severity                        | Material misleading flow, inaccessible critical path, or support capacity exceeded                         |
| Operations            | Alert acknowledgement, runbook success, staffing, provider responsiveness                    | On-call/support/warehouse/courier capacity cannot safely serve the current cohort                          |

An accountable owner may stop expansion for qualitative evidence even if a numeric threshold has not fired.

## 8. Rollback and containment

Rollback prioritizes prevention of new harm, preservation of evidence, and deterministic recovery—not merely returning binaries to an earlier version.

### 8.1 Containment order

1. Stop or narrow the affected new actions with the smallest relevant kill switch.
2. Preserve logs, traces, provider messages, database snapshots, ledger evidence, deployment metadata, and flag history.
3. Classify in-flight orders/payments/shipments into deterministic recovery queues; do not guess terminal states.
4. Notify incident roles and affected providers; initiate customer/seller communications when approved.
5. Roll back software/configuration only when the prior version is compatible with current schema and events.
6. Reconcile and repair through approved compensating entries or replay tools; never edit financial/audit history in place.
7. Resume only after the risk owner approves evidence that the cause is contained and state is reconciled.

### 8.2 Rollback modes

| Change type              | Preferred rollback                                                           | Constraint                                                                    |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Feature behavior         | Disable server-side flag or shrink cohort                                    | Off-path must be tested and audited                                           |
| Application release      | Route to known-good immutable release                                        | Database/events must remain backward compatible                               |
| Database schema          | Stop new writes to feature; use backward-compatible code                     | Destructive reversal is not a launch-time strategy                            |
| Data migration           | Restore isolated copy for analysis; correct via versioned, idempotent repair | Do not overwrite valid post-migration customer or financial actions           |
| Payment provider/method  | Disable initiation; retain status polling/webhooks/reconciliation            | Never label an unknown payment failed without authoritative evidence          |
| Courier/fulfillment path | Stop new assignments; preserve tracking and exception handling               | Existing custody chain must remain visible                                    |
| Search/index             | Serve last-known-good index or constrained database fallback                 | Do not expose inactive/prohibited/unavailable offers                          |
| Mobile client            | Server-side compatibility and feature disablement                            | App-store rollback is slow; minimum supported versions require advance policy |
| Legal/content version    | Revert to an approved, effective version with audit trail                    | Preserve which version each user accepted or received                         |

## 9. Incident and communications plan

During Stages 3–8, use the severity model and incident lifecycle in the [observability and operations plan](./20-observability-and-operations.md).

- The launch commander owns the decision timeline and cohort state.
- The incident commander owns mitigation during an incident; these roles may be different people.
- Security or privacy incidents immediately engage the security/privacy leads and qualified counsel for notification analysis.
- Finance incidents stop relevant payout/refund/payment mutations until finance confirms controls.
- Customer, seller, courier, provider, regulator, and public communications have named approvers and Arabic/French templates.
- Communications state known facts, user impact, safe next action, and update time; they avoid speculative root causes.
- A public status channel must not leak personal, seller-confidential, fraud, security, or investigation information.

## 10. Hypercare and transfer to normal operations

### 10.1 Recommended hypercare coverage

- **First 72 hours:** continuous launch coordination across engineering, security, operations, payments/finance, support, product, warehouse, courier, and provider contacts.
- **Days 4–14:** daily technical and financial review, daily issue prioritization, and no material scope expansion without the same gate discipline.
- **Days 15–30:** normal on-call coverage plus twice-weekly risk, reconciliation, capacity, seller-quality, delivery, return/refund, and support review.

### 10.2 Hypercare exit criteria

- SLOs and error budgets remain within approved bounds for the agreed observation window.
- No unresolved severity-1/2 incident or systemic financial, privacy, security, legal, inventory, or fulfillment inconsistency.
- Full payment, refund, payout, COD, return, and seller-settlement cycles reconcile.
- Operational volumes fit staffing and provider capacity with measured headroom.
- Alert noise is actionable; runbooks reflect actual incidents and mitigations.
- Customer/seller complaints and support contact rates are within approved thresholds.
- Temporary flags, elevated access, manual workarounds, and launch-only dashboards have owners and removal dates.
- Residual risks and remediation commitments are accepted by permanent business-as-usual owners.
- A launch retrospective and updated architecture/operations decision log are published.

## 11. Expansion rules after launch

Treat each new category, regulated product type, payment provider, wallet/custody model, seller country, cross-border flow, warehouse, courier, data-processing country, or materially different fulfillment model as a new risk assessment—not a configuration toggle.

Before expansion:

- repeat the relevant legal, privacy, accounting, security, performance, provider, reconciliation, and operational gates;
- isolate the change to a measurable cohort;
- define rollback and settlement treatment;
- update seller/customer disclosures and legal versions where required;
- prove support, warehouse, courier, and finance capacity;
- retain the decision and evidence in the release register.

## 12. Required release evidence pack

The release record must contain at least:

- approved architecture decision and outstanding-condition register;
- legal/compliance and accounting sign-offs with scope, date, assumptions, and expiry/review date;
- privacy processing map, ANPDP filing/authorization evidence where applicable, and processor/subprocessor register;
- threat model, security test reports, vulnerability exceptions, access reviews, and incident exercise results;
- signed QA report, performance/chaos results, accessibility/localization report, and browser/device matrix;
- provider certifications/approvals, production configuration checks, and escalation contacts;
- migration manifests, validation totals, rejected records, backup/restore evidence, and reconciliation baselines;
- deployed artifact digests, infrastructure/configuration versions, schema versions, feature-flag snapshot, and cohort definition;
- seller/catalog/fulfillment/courier readiness evidence;
- go/no-go decisions, incidents, customer communications, daily reconciliations, and rollback drills;
- hypercare review and transfer-to-operations acceptance.

Evidence must be access-controlled, tamper-evident where appropriate, retained under the counsel-approved schedule, and discoverable without exposing more personal or sensitive data than necessary.

## 13. Open decisions before architecture approval

| Decision                                                               | Owner                        | Why it blocks launch planning                                                                  |
| ---------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Exact legal entity and marketplace contracting model                   | Executive/legal              | Determines registrations, disclosures, liability, invoices, seller terms, and fund flow        |
| Algeria-hosting scope and approved providers                           | Legal/privacy/infrastructure | Determines deployable topology, transfer controls, support access, and disaster recovery       |
| `.com.dz` registration holder and registrar path                       | Legal/operations             | Required identity/domain evidence must be available before production routing                  |
| Payment methods, providers, merchant-of-record role, and funds custody | Finance/legal                | Determines regulatory perimeter, provider certification, ledger, refund, and settlement design |
| COD ownership, cash limits, couriers, and remittance schedule          | Finance/operations/legal     | Determines custody risk, reconciliation, insurance, and category restrictions                  |
| Launch categories and restricted-product policy                        | Product/legal/compliance     | Determines seller evidence, moderation, recalls, and category-specific law                     |
| Pilot wilayas, fulfillment nodes, and service promises                 | Product/operations           | Determines cohort controls, capacity, courier coverage, and support staffing                   |
| RPO/RTO, SLOs, error budgets, and numeric stop thresholds              | Business/technology owners   | Determines infrastructure, on-call, test, and expansion criteria                               |
| Retention and deletion schedule by record class                        | Legal/privacy/finance        | Determines storage, backups, audit evidence, rights handling, and cost                         |
| General-availability definition and executive risk appetite            | Executive sponsor            | Determines when staged rollout may become normal operation                                     |

## 14. Phase 0 exit decision

The final Phase 0 review must result in one recorded outcome:

- **Approved:** implementation may begin within the approved scope.
- **Approved with conditions:** implementation may begin only for explicitly permitted work, with owners and deadlines for every condition; production exposure remains blocked until conditions close.
- **Rejected:** the architecture returns for revision; no implementation begins.

The Phase 0 decision does not authorize production launch. It authorizes implementation of the approved architecture. Production launch remains subject to every applicable gate in this document.
