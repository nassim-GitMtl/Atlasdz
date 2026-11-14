# Project Atlas DZ — Production Readiness Continuation Prompt

Copy everything inside the block into the Codex task you want to use for the production build.

```text
Continue Project Atlas DZ from its current repository state and work autonomously toward a production-deployable controlled MVP.

Current baseline

- `/Users/nams/Documents/Amazon/docs/phase-0/` contains the approved-for-prototyping product, architecture, domain, API, security, infrastructure, testing, observability, rollout, and phasing specifications.
- `/Users/nams/Documents/Amazon/prototypes/customer-web/` contains the verified Product Design direction 2, “Mobile Bazaar,” homepage prototype.
- The prototype is visual and interactive only. It is not the production application and has no production backend, authentication, live catalog, inventory, checkout, payments, shipping, seller tooling, operations tooling, or infrastructure.
- `atlas dz` is a provisional working identity.
- Product and architecture were approved only for prototyping. Security, finance, legal/compliance, logistics, platform, accounting/tax, data-governance, provider, and final-release approvals remain pending. Never fabricate, infer, or silently mark those approvals complete.

Mission

Build the technically production-deployable MVP described by the Phase 0 package in safe, verifiable stages while preserving the approved visual direction and every documented domain invariant. Continue from existing work on every run; do not restart completed work.

Operating rules

1. Read the repository instructions, current status, relevant Phase 0 documents, and existing code before changing anything.
2. Inspect the working tree first. Preserve all user changes and unrelated work. Never discard, reset, overwrite, or rewrite user-owned changes.
3. Create and maintain `docs/implementation/PRODUCTION-READINESS.md` as the durable source of truth. It must record the requirement matrix, completed work, implementation locations, test evidence, decisions, risks, external blockers, and exact next task. Update it after every meaningful unit of work so a later `continue` message can resume without reconstructing context.
4. Implement one coherent vertical slice at a time. Finish its code, migrations, contracts, tests, documentation, security considerations, and operational evidence before advancing.
5. Make reasonable, reversible technical decisions autonomously when the approved documents establish intent. Ask only when a missing choice would materially change scope, incur cost, expose production data, require credentials, authorize an external/destructive action, or pretend to provide a professional sign-off.
6. Do not invent legal rules, tax values, retention periods, COD ceilings, commission rates, provider behavior, credentials, approvals, launch wilayas, courier coverage, production secrets, RPO/RTO values, or SLO thresholds. Represent unresolved policy as validated configuration, disabled feature flags, replaceable provider interfaces, or explicit blockers.
7. Do not claim “production ready,” “approved,” “certified,” “secure,” “compliant,” or “deployed” without concrete evidence for that exact claim.
8. Never deploy publicly, purchase services, contact third parties, mutate real provider accounts, or use production credentials unless the user explicitly authorizes that exact action.
9. Do not commit or push unless explicitly requested.
10. Keep dependencies justified and pinned. Do not replace the approved architecture merely for convenience.
11. Continue into the next safe, unblocked task without asking for routine confirmation. Do not stop after producing only a plan.

Required architecture

- TypeScript `pnpm` monorepo following `docs/phase-0/15-repository-structure.md`.
- Next.js production web applications and a NestJS modular-monolith API with worker and scheduler composition roots.
- PostgreSQL as system of record, Redis for ephemeral state, OpenSearch for multilingual discovery, S3-compatible object storage, transactional outbox, and a durable broker behind replaceable adapters.
- Shared versioned API, event, notification, and error schemas with generated clients and compatibility checks.
- Strict bounded contexts, backend-authoritative authorization, actor/scope context, idempotency, immutable order snapshots, concurrency-safe inventory, immutable seller ledger, segregation of duties, and complete audit trails.
- Never store or log raw PAN, CVV, PIN, authentication secrets, or other prohibited payment data.
- Arabic and French are first-class experiences, including true RTL geometry, accessibility, responsive behavior from 320 px upward, SEO, performance, and graceful loading/empty/offline/error/timeout states.
- Treat the verified prototype as the visual source for production Customer Web, but rebuild/migrate it into the approved production structure rather than deploying the prototype directory as the marketplace.

Implementation sequence and gates

Stage 0 — Baseline and gap ledger

- Audit the repository against every Phase 0 deliverable, MVP requirement, and rollout gate.
- Build the production-readiness matrix with columns for requirement, source document, implementation, tests/evidence, status, owner, blocker, and next action.
- Separate technical gaps from decisions or approvals that only qualified humans or contracted providers can supply.
- Define exact commands for clean install, lint, format, typecheck, unit/integration/contract/E2E tests, build, local stack, migrations, seed, and smoke verification.

Stage 1 — Engineering foundation

- Scaffold the approved monorepo, shared configuration, package boundaries, contract tooling, dependency rules, and CI.
- Add reproducible local infrastructure, environment validation, secret placeholders, health/readiness checks, structured redacted logging, correlation IDs, metrics, tracing hooks, migration tooling, synthetic seed data, and test harnesses.
- Establish identity, secure sessions, verified-phone abstraction, privileged-user MFA capability, RBAC/ABAC enforcement, audit, configuration/feature flags, locations, and transactional outbox.
- Prove the foundation with unit, integration, contract, authorization, migration, and smoke tests before advancing.

Stage 2 — Catalog vertical

- Implement centralized categories and attributes, products, variants/SKUs, seller offers, media, moderation, inventory, reservations, search indexing, Arabic/French search behavior, and catalog administration.
- Integrate production Customer Web homepage, discovery, category, search, product details, offer comparison, wishlist, and all relevant UI states.
- Prove seller isolation, moderation authority, inventory concurrency, indexing consistency, accessibility, RTL, responsive behavior, and search fallbacks.

Stage 3 — Commerce vertical

- Implement multi-seller cart, pricing snapshots, delivery quotes, checkout, verified-phone COD eligibility, idempotent order creation, seller-order splitting, confirmation records, notifications, cancellation, and customer order history.
- Keep electronic payments disabled by a fail-safe server-side feature flag unless an authorized provider, legal review, sandbox certification, webhook authentication, reconciliation, refund behavior, and operational evidence are supplied.
- Prove duplicate-request safety, oversell prevention, price integrity, callback replay handling, partial failure recovery, and end-to-end customer journeys.

Stage 4 — Seller, fulfillment, and operations

- Implement the MVP portions of Seller Center, Marketplace Admin, Support Console, Warehouse Console, Courier experience, and Operations Dashboard.
- Cover seller onboarding/document review, offer and inventory management, seller order handling, receiving, putaway, pick/pack/manifest/handoff, shipment tracking, delivery attempts, proof/failure reasons, COD custody, exceptions, support cases, and audit.
- Keep provider-specific behavior behind tested adapters. Do not expose uncontracted delivery methods or geographic coverage as real promises.

Stage 5 — Returns and finance

- Implement returns/RMA, inspection, refund orchestration, COD reconciliation, immutable double-entry-style seller subledger, commissions, holds, settlement calculation, statements, discrepancies, and maker-checker payout approval.
- Keep real payouts disabled until authorized finance/provider configuration and approvals exist.
- Add invariant, reconciliation, replay, rounding, concurrency, and audit tests. Ledger imbalance or unexplained reconciliation differences are release blockers.

Stage 6 — Production platform

- Add hardened containers, provider-neutral IaC modules, environment separation, least-privilege IAM policies, network controls, secret/KMS integration points, WAF/rate-limit configuration, dependency and image scanning, SBOM generation, immutable artifacts, and backward-compatible deployment/migration strategy.
- Implement dashboards, alerts, SLO instrumentation, queue/DLQ monitoring, backup automation, restore verification, runbooks, kill switches, incident procedures, rollback, and controlled repair tooling.
- Do not select or claim an Algerian-compliant production host until the accountable owner and qualified reviewer approve it.

Stage 7 — Release evidence

- Run lint, formatting, typecheck, unit, integration, contract, E2E, accessibility, RTL, localization, security, resilience, migration, reconciliation, and production-build checks.
- Run representative performance tests for browse, search, cart, checkout, callbacks, reservations, workers, and queues. Record measured results without inventing acceptance thresholds.
- Test clean installation, fresh database migration, backward/forward compatibility, backup restoration, health probes, dependency failures, feature-flag off paths, rollback, and a production-like deployment rehearsal.
- Map every MVP requirement and launch gate to concrete evidence.
- Produce three separate conclusions: (a) technically deployable, (b) ready for controlled staging, and (c) ready for a commercial production launch. Commercial launch must remain blocked until all required external approvals, provider contracts/certifications, production configuration, operational owners, and rehearsals are evidenced.

Quality requirements

- Every behavior change receives proportionate automated coverage. Tests must assert domain invariants, not merely happy-path status codes.
- No skipped/focused tests, ignored type errors, fabricated mocks presented as live integrations, hidden failing checks, placeholder security controls, or TODOs on critical money/order/inventory paths.
- Use synthetic data only until production data use is explicitly authorized.
- Validate input and output contracts at every boundary.
- Enforce tenant/seller scope and object-level authorization on the server.
- Redact credentials, tokens, sensitive documents, and personal data from logs and fixtures.
- Verify changed customer-facing flows in a real browser for responsive French LTR and Arabic RTL behavior.
- Update documentation and the readiness tracker in the same change as implementation.
- Fix failures before moving forward. If a test cannot run because of a genuine external dependency, record the exact dependency and leave that gate open.

Start-of-run procedure

1. Read `docs/implementation/PRODUCTION-READINESS.md` if it exists and inspect the current working tree.
2. Verify the last completed checkpoint rather than trusting an old narrative.
3. Select the highest-priority incomplete task that is not externally blocked.
4. Implement and verify it fully.
5. Update the tracker and continue directly to the next safe task while capacity remains.

Normal milestone report

At the end of a genuinely completed milestone, report what changed, tests and evidence, remaining work, external blockers, and the exact next milestone. Do not output `continue` for an ordinary milestone or normal response.

Usage-exhaustion protocol

Checkpoint continuously because a hard platform limit may prevent a final message. If a usage-limit or context-capacity condition is exposed before the turn ends and there is not enough capacity to complete another atomic task, first leave the working tree coherent, run the relevant checks if possible, and update `docs/implementation/PRODUCTION-READINESS.md` with the exact resume point. Then make the entire visible response exactly:

continue

Do not add punctuation, Markdown, explanation, status, or any other word. Use this one-word response only for usage/context exhaustion. When the next user message is `continue`, resume immediately from the durable tracker and do not repeat finished work.
```
