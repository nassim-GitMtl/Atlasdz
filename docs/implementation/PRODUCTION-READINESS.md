# Project Atlas DZ — Production Readiness

> Current-state supplement: [Remaining release work](REMAINING-RELEASE-WORK.md) and
> [repository checkpoint](../../TASK_PROGRESS.md). Entries below retain historical evidence;
> their older missing-feature statements must not be treated as the latest inventory.

Last checkpoint: 2026-11-08 (reviewed product revisions: 43 focused checks, affected builds/lint/types pass; migration 000018 applied; release-image evidence remains 2026-11-01 and full-suite evidence 2026-10-21)
Current stage: release packaging, bilingual product submissions/revisions and local commerce implemented; production identity, product media and deployment/restore rehearsal incomplete
Target: technically deployable controlled MVP  
Commercial production status: **NO-GO**

This is the durable implementation ledger. A completed technical row does not imply legal,
financial, security, provider, operational, staging, or commercial-launch approval.

## Current scope authority — 2026-10-06

The owner explicitly replaced the hybrid/warehouse model with a **seller-fulfilled marketplace**.
[ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and the revised
[scope phasing](../phase-0/22-scope-phasing.md) control implementation and release gates.
Customers buy through Atlas DZ; orders route to sellers who accept, pack, arrange shipment,
and report delivery. Atlas DZ provides software, moderation, order records, notifications,
customer visibility, support, and disputes. Seller stock tracking and reservations remain required.

Marketplace-owned stock, warehouses, physical fulfillment, procurement, delivery fleets,
driver apps, and platform custody of goods/COD cash are `OUT_OF_SCOPE`. Native apps are deferred.
Platform wallets, seller payouts, and a settlement ledger are conditional on a future explicitly
approved funds-flow model; they are not prerequisites when Atlas DZ never handles seller funds.
Electronic payments and real payouts remain disabled. Seller returns and payment-method-appropriate
remedy records remain in scope. Historical Phase 0 requirements below do not override this decision.

On 2026-10-18 the owner approved seller/courier-collected COD and one seller-configured shipping
charge per order and destination. [ADR-012](../decisions/ADR-012-cod-and-destination-shipping.md)
records the decision. COM-01C now implements persisted destination rates and immutable checkout
snapshots in LOCAL/TEST. Actual coverage/rates, authoritative geography, validated addresses and
commercial checkout remain required. Fictional destinations are not Algerian reference data.

## Three readiness conclusions

| Conclusion                              | Status                                      | Evidence / reason                                                                                                                                               |
| --------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technically deployable                  | **No — artifacts verified only**            | Release images pass isolated checks; production identity/MVP verticals, deployment rehearsal and rollback evidence remain incomplete.                           |
| Ready for controlled staging            | **No**                                      | No integrated release candidate, production-like environment, provider sandbox evidence, security assessment, restore exercise, or operations rehearsal exists. |
| Ready for commercial production         | **No — externally and technically blocked** | MVP verticals are incomplete and specialist legal, privacy, tax, finance, security, logistics, hosting, provider, and release approvals remain pending.         |
| Customer Web visual direction validated | **Connected prototype only**                | `prototypes/customer-web` now demonstrates the synthetic home-to-COD-to-tracking journey with responsive French/Arabic QA; it is not a production application.  |

## Status vocabulary

- `VERIFIED`: implementation and the listed evidence passed in this repository state.
- `IMPLEMENTED_UNVERIFIED`: code exists but its required evidence has not all passed yet.
- `PARTIAL`: only part of the requirement is implemented or evidenced.
- `DOCUMENTED`: Phase 0 defines the requirement; production implementation is absent.
- `NOT_STARTED`: no qualifying implementation exists.
- `EXTERNAL_BLOCKER`: an accountable human, qualified adviser, contracted provider,
  credential, certification, or production decision must supply the missing evidence.
- `OUT_OF_SCOPE`: explicitly excluded from this release by the owner; not a release blocker.
- `CONDITIONAL`: required only if an explicitly approved business-model decision activates it.

## Checkpoints

### CAT-02B — reviewed product text revisions — VERIFIED (bounded, 2026-11-08)

- Originating sellers can propose corrections from an approved product submission via
  `/products/[id]/edit`. The source must be the current approved revision, owned by the scoped
  seller; category and product/variant identity cannot be changed. Other sellers cannot read
  private proposals or submit revisions against them. Seeded/shared products without an owned
  approved proposal are not editable through this path.
- Staff compare previous and proposed French/Arabic text in the existing moderation queue.
  Pending/rejected revisions never replace published text. Approval updates the existing shared
  product atomically with review, audit and outbox, preserving offers and order snapshots.
- Immutable history forms a linear approved chain with one pending revision per source,
  owner-scoped database references, request-hash retry protection and stale-source rejection.
  Seller/category/product eligibility is rechecked; outbox failures roll back the product edit.
- Evidence: 15 catalog PostgreSQL integration, 7 API boundary, 3 form-input, 5 catalog boundary
  and 13 shared-contract checks pass (43). Targeted lint/format, Seller Center typecheck and
  contracts/catalog/API/Seller Center builds pass. Local migration `000018` applied; all 18
  checksums verified. API/Seller Center restarted without resetting data.
- Seller browser verification remains blocked pending explicit port 3002 approval. Release
  images were not rebuilt for this phase; the November 1 images do not contain these revisions.
  Photo uploads, richer variants, paginated history, production identity, external notifications,
  after-sales completion and deployment/restore rehearsal remain open. Launch stays NO-GO.

### CAT-02A — bilingual product proposals and review — VERIFIED (bounded, 2026-11-01)

- Seller `/products` accepts French/Arabic titles/descriptions in active, approved standard
  categories. Tenant ownership comes from the authenticated principal; separate `product.submit`
  and global staff `product.review` permissions require MFA. Normal production identity remains
  fail-closed; only explicitly LOCAL/TEST role fixtures receive the new grants automatically.
- Submission retries are scoped by seller/request UUID and normalized content hash, with a
  100-pending-per-seller limit. Staff `/moderation/products` approves or rejects with a reason.
  Concurrent decisions use version checks; identical review retries do not duplicate audit/events.
- Approval atomically creates the canonical product and default variant. Authenticated offer
  selection includes approved products without public offers, fixing the first-offer dead end.
  Product approval alone never makes it publicly discoverable: a separate approved seller offer
  remains required. Restricted categories and unapproved sellers cannot publish through this path.
- Atomic audit/outbox, private pending proposals, cross-seller isolation, changed retry inputs,
  concurrent moderation, invalid fields and rollback on event-write failure are tested. Database
  time is used for audit events. No full product text/rejection reasons are emitted in outbox payloads.
- Evidence: 13 catalog integration, 7 API boundary, 10 local identity, 2 form-input, 5 catalog
  boundary and 13 shared-contract tests pass (50 total); targeted lint/format and backend/both
  web builds pass. Four ARM64 release images rebuilt; isolated artifact smoke passes.
- Migration `000017` applied locally; all 17 checksums verified. Existing data was not reset.
  Local apps restarted. Sign out/in to load the updated synthetic role grants.
- Product images currently use an explicitly disclosed application-owned neutral SVG. Uploads,
  media moderation, richer variants, duplicate-product matching,
  and paginated authoring history remain open. Seller browser/accessibility verification remains
  blocked pending explicit port 3002 approval; no browser test was bypassed.

### REL-01 — release artifact packaging — VERIFIED (bounded, 2026-11-01)

- Added `infra/release/Dockerfile`, Compose, secret-file template and operator runbook. Four
  local ARM64 images build: API, migration runner, Customer Web and Seller Center. No registry
  push, production environment, DNS/TLS setup or release database was created.
- Pinned Node image digest; non-root/read-only Compose runtime, resource/log limits, loopback
  bindings and explicit one-shot migrations. Both Next apps now package standalone/static assets.
- Release startup rejects synthetic accounts/checkout, payments/payouts, invalid origins,
  unverified database TLS and conflicting secret sources. Runtime API configuration independently
  rejects unsafe staging/production settings. Nine focused configuration tests and targeted lint
  pass; backend and both web builds pass.
- Fixed observed pnpm 11.19 deploy workspace-link/missing-dependency defects using an isolated
  pinned 11.25 packaging step and corrected package self-links. Repository dependency/build pins
  and migration files remain unchanged. No custom package-copy workaround remains.
- `tools/deployment/smoke-images.mjs` passes: all four images non-root, no escaping/broken
  dependency links, unsafe startup rejected; migration module imports; API/customer liveness
  succeeds with read-only filesystems, database-down readiness is 503, synthetic API login is 404.
  Test containers have no network or published ports and are removed afterward.
- CI artifact job added, not hosted/executed. Seller HTTP/browser journey, real TLS/database
  migration, restore/rollback, image vulnerability review and target-host/AMD64 checks remain
  pending. Existing local web processes were refreshed; local data/order/rate state was untouched.

See [release runbook](../../infra/release/README.md). Packaging is not functional production
identity/checkout and does not change any NO-GO conclusion.

### S0-01 — baseline and gap ledger — VERIFIED

- Audited Phase 0, the prototype, production tree, commands, and source-control state.
- Separated engineering work from decisions/approvals that cannot be fabricated.
- Confirmed the directory is not currently a Git repository; no commit/PR/branch evidence exists.
- Recorded that the connected visual/interaction prototype is reference evidence only.

### S1-01 — engineering foundation bootstrap — VERIFIED

Implementation now present:

- Root pnpm/Turbo workspace, strict TypeScript, ESLint, Prettier, stable commands, and CI:
  `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `eslint.config.mjs`, `.github/workflows/ci.yml`.
- Shared versioned primitives, actor context, API error, event, and health schemas:
  `packages/contracts`.
- Fail-closed runtime configuration, recursively redacted structured logging,
  provider-neutral metrics and tracing hooks: `packages/platform`.
- NestJS API foundation with unversioned liveness/readiness, bounded PostgreSQL health,
  canonical UUID/ULID correlation IDs, AsyncLocalStorage propagation, secure headers,
  exact-origin CORS, body cap, stable Phase 0 error mapping, request metrics, and graceful
  shutdown hooks: `apps/api`.
- Worker and scheduler composition roots that boot with provider delivery/jobs disabled:
  `apps/worker`, `apps/scheduler`.
- Checksum-locked ordered migration runner, migration status/verification, LOCAL/TEST-only
  deterministic seed, and disposable-database integration harness: `packages/database`.
- Initial PostgreSQL schemas for identity/session/RBAC, versioned flags, immutable audit,
  transactional outbox/inbox, and versioned location provenance:
  `database/migrations/000001_foundation.sql`.
- Loopback-bound local PostgreSQL, Redis, OpenSearch, RabbitMQ, and S3-compatible test storage:
  `infra/local/compose.yml`.
- Electronic payment and real payout enablement are rejected by environment validation and
  seeded as current false/fail-safe-false database flags.
- Node.js 24.21.0 is pinned through pnpm's project runtime and in CI. The deprecated
  `prom-client` package was replaced with the Prometheus-maintained `@prometheus-io/client`.
- `tools/smoke/api-smoke.ts` boots the built API on an ephemeral loopback port, validates the
  HTTP/security contracts against PostgreSQL, redacts child diagnostics, and proves clean
  bounded `SIGTERM` shutdown. CI runs the same smoke after the integration suite.

Verification evidence (2026-10-04):

- `pnpm install --frozen-lockfile`: already up to date; pinned graph accepted.
- `pnpm peers check`: no peer dependency issues.
- `pnpm verify`: format, lint, typecheck, 15 unit assertions, 10 contract assertions, and all
  six production builds passed on the project-pinned Node.js 24.21.0 runtime.
- `pnpm infra:up` passes with PostgreSQL, Redis, OpenSearch, RabbitMQ, and the S3-compatible
  test adapter all healthy and loopback-bound. The S3Mock health check uses its bundled
  `wget` with an explicit JSON `Accept` header; the image does not contain `curl`.
- `docker compose --env-file .env.local -f infra/local/compose.yml config --quiet`: passed.
- `pnpm db:migrate` applied `000001`; the immediate second run applied no migrations.
- `pnpm db:status` reports the migration applied with a matching checksum;
  `pnpm db:verify` passes; `pnpm db:seed:synthetic` reports `dataClass: synthetic`.
- `pnpm test:integration` passes both disposable-database tests: repeat migration/schema
  verification and rollback/commit transaction-plus-outbox atomicity.
- `pnpm smoke`: built API live/ready, PostgreSQL dependency, security headers, canonical
  correlation, stable safe errors, exact-origin CORS, and graceful shutdown all passed.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities found after the metrics
  client replacement.

### S1-02A — session-backed principal and authorization control plane — VERIFIED

Verified boundary: authenticate an already-verified access credential against authoritative
live PostgreSQL identity/session state, authorize the resulting immutable principal, and let
that principal list or revoke its own session families. This checkpoint does not issue or refresh
credentials.

Implementation and evidence:

- `packages/contracts` defines validated actor/scope/assurance context, session-list and
  revocation payloads, canonical unversioned event names with explicit `eventVersion`, and typed
  safe application failures.
- `packages/backend/identity` contains the provider-neutral credential-verifier port,
  point-in-time principal resolver, permission/scope/assurance authorizer, and self-session
  service. It fails closed on invalid credential time windows, inactive users, missing or stale
  sessions, family compromise, claim/binding mismatch, inconsistent authorization graphs,
  cross-actor grants, inadequate MFA evidence, and missing permission.
- `packages/backend/identity-postgres` reads one authoritative authorization snapshot and
  implements family-backed self-session list/revocation. Revocation locks the family, updates all
  live generations, emits one immutable audit record and one canonical outbox event, is
  idempotent under duplicate/concurrent calls, makes foreign and missing IDs indistinguishable,
  and rolls the transaction back if evidence cannot commit.
- `apps/api` has global fail-closed authentication and route-classification/permission guards plus
  documented `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:sessionId`, and
  `DELETE /api/v1/auth/sessions` boundaries. All three operations have explicit authenticated
  rate-limit metadata. Missing production credential and limiter adapters deny access instead of
  silently bypassing controls; rate-limit response headers are CORS-exposed.
- Checksum-locked migrations `000002`–`000005` establish actor-aware RBAC, authoritative session
  families, immutable credential and lineage fields, one-root/one-current topology, direct-parent
  rotation and MFA inheritance, family-wide replay termination, canonical replay evidence, and
  protected lifecycle history. The legacy migration path refuses non-empty ambiguous identity or
  delivery state instead of guessing a backfill.
- The live-schema verifier checks constraint table/type/validation, partial unique-index
  semantics, and trigger enabled/timing/event/function/deferrability metadata. Disposable drift
  tests prove that a same-named decoy constraint, weakened index, or disabled replay trigger is
  rejected.
- Persistent LOCAL PostgreSQL has migrations `000001`–`000005` applied with matching checksums;
  repeat migration applies nothing, schema verification passes, and deterministic synthetic
  seeding still passes.
- `pnpm verify` passes format, lint, typecheck, 43 API unit cases, 24 identity cases, 12 PostgreSQL
  identity-adapter cases, foundation/platform units, 7 contract cases, and all 8 production
  builds. `pnpm test:integration` passes 9 database, 4 identity-adapter, and 1 API/PostgreSQL
  integration cases. `pnpm smoke`, `pnpm peers check`, and
  `pnpm audit --prod --audit-level high` pass.

Explicitly outside this verified boundary and still fail-closed: credential issuance, verified
phone enrollment, password/OTP/MFA challenge and recovery, signing-key custody, refresh-token API
and family-first rotation/replay command, replay alert/outbox delivery, and a production distributed
rate-limit store/policy. Those belong to S1-02B and provider/operations gates; this checkpoint does
not make the application deployable or production-ready.

### S1-02B — internal refresh rotation/replay — VERIFIED internal boundary (2026-10-07)

- Raw-token-free application command and PostgreSQL rotation adapter are implemented in
  `packages/backend/identity` and `packages/backend/identity-postgres`.
- Locks user, family, then generation; one direct successor wins; predecessor replay terminates
  the entire family and atomically records audit plus session-revoked/suspicious-login outbox
  events. Duplicate replay records no duplicate evidence. Outbox/hash conflicts roll back.
- Migration `000006` enforces wall-clock expiry checks in long transactions. Persistent LOCAL
  migration and foundation schema verification pass; applied migration checksums match.
- Full `pnpm verify` passed on 2026-10-07, including 27 identity cases, 18 PostgreSQL adapter
  unit cases and 8 contracts. Integration passes 10 database and 9 identity adapter cases.
- This is an internal command only. Public credential issuance/refresh, signing-key custody,
  phone verification, real MFA/recovery, alert delivery, and production rate limiting remain open.

### CAT-01A — persisted seller catalog and customer discovery — VERIFIED bounded slice (2026-10-07)

- `000007_seller_catalog.sql` creates sellers, controlled categories, products/default variants,
  and seller-owned offers/quantities. `000008_seller_catalog_permissions.sql` adds granular offer
  permissions. No warehouse, marketplace inventory, or platform courier entities were added.
- `@atlas/catalog` implements current-state visibility filtering, literal French/Arabic search,
  pending seller offers, scoped listing, staff approval, and atomic audit/outbox mutation records.
- `apps/api/src/catalog` exposes public catalog routes and MFA/permission-protected seller offer
  creation/listing and staff approval. Ownership comes from the server principal; body overrides
  are rejected. Default production identity/rate-limit composition still denies protected actions.
- `apps/customer-web` is a separate production Next.js app with home, search, category, product,
  and seller-store routes, offer comparison, French/Arabic, true RTL, loading/empty/error/not-found
  states, and server-validated API responses. All product data comes from PostgreSQL through the
  API. Assets reuse the selected Mobile Bazaar direction. Six products/four sellers are synthetic.
- Full `pnpm verify` passed: 49 API cases, 4 catalog cases, 3 customer-web cases, existing
  foundation/identity/contracts suites, strict lint/types, formatting, and 10 workspace builds.
- `pnpm test:integration` passed 27 cases: database 10, identity adapter 9, catalog 7, API 1.
  Catalog tests cover hidden publication, seller isolation, concurrent approval, outbox failure
  rollback, and synthetic seed conflict protection. `pnpm peers check` passed.
- Persistent LOCAL has `000001`–`000008`; repeat migration is a no-op; schema verification,
  foundation seed, and `pnpm catalog:seed:synthetic` pass. During parallel authoring `000007`
  was applied before permission edits finished; its exact original bytes were restored and
  checksum reverified, and permissions moved to additive `000008`. No ledger rewrite or reset.
- Browser evidence: 1440px French homepage; product seller/price/quantity/handling/shipping;
  320px Arabic product with `lang=ar`, `dir=rtl`, document width equal to viewport; seller store
  contains only its two offers; Arabic search finds one matching product; category/search empty
  state; language switching preserves filters; no console errors/warnings observed in that run.
- New full-process smoke and dependency audit were not run: automatic approval review rejected
  `pnpm smoke` and `pnpm audit --prod --audit-level high` because its usage limit was reached.
  These gates remain open; previous-checkpoint passes do not establish current-state evidence.
- Still absent: seller/admin interactive access, full onboarding/product authoring, coverage-aware
  shipping, indexed/paginated search, stock edit/reservation lifecycle, cart, checkout, orders,
  notification dispatch, returns/support, and deployment/recovery evidence. This slice is not a
  complete marketplace or commercial release candidate.

### CAT-01B — Seller Center and isolated local testing — VERIFIED bounded slice (2026-10-08)

- `apps/seller-center` adds production-built Next.js offer list/create, admin moderation,
  validation, unavailable/access/empty states, and French/Arabic responsive views. Server-side
  API calls validate shared contracts; credentials remain in an HttpOnly, SameSite=Strict cookie.
  Form origin checks, bounded exact-integer centime parsing, and pending-submit states are present.
- A new admin queue API lists pending offers with GLOBAL staff/MFA/permission enforcement.
  Seller ownership still derives exclusively from the live principal; approval is transactional.
- Explicit LOCAL/TEST-only `local-main.ts` starts on loopback port 3003. It issues short-lived
  opaque synthetic credentials backed by persisted session families and live RBAC, with hashed
  tokens and explicitly synthetic MFA provenance. Conflicting fixture data is refused, not widened.
  Normal `main.ts` remains fail-closed and never mounts the local login endpoint.
- `pnpm verify` passed: formatting, lint, strict types, 64 API cases, 6 Seller Center cases,
  existing catalog/customer/identity/platform/database/contract suites and all 11 workspace builds.
  A sandbox-only first attempt could not open test sockets; the authorized rerun passed.
- `pnpm test:integration` passed 31 cases: database 10, identity adapter 9, catalog 7, API 5.
  The new API tests prove persisted role/session resolution, expiry/revocation, fixture-conflict
  rollback, and seller submission → staff approval → anonymous discovery. A wrong product slug
  in the first HTTP test was corrected; the actual route and final test pass.
- Browser evidence: seller logs in and submits an offer at 4,250.50 DZD; pending offer is hidden
  from customers; seller moderation access denied; admin reviews and approves; customer sees the
  second offer with exact stock, price and shipping. Arabic client navigation updates `html`
  language/direction. Loaded 320px Arabic moderation has document width 320px with no overflow.
  No seller-page console errors/warnings observed. This is bounded manual evidence, not a full
  automated accessibility/security/browser suite.
- Previous approval-review capacity blockage cleared. Authorized `pnpm smoke` now passes
  process startup/readiness, headers, correlation/errors, fail-closed identity, CORS and shutdown.
  `pnpm audit --prod --audit-level high` reports no known vulnerabilities on 2026-10-08.
- Exact local commands and test limitations: [LOCAL-TESTING.md](LOCAL-TESTING.md).
  Persistent LOCAL data now includes one additional approved synthetic Maison Plus earbuds offer.
  No migration, real user, production identity provider, payment or external notification was added.
- Still incomplete: real seller onboarding/authentication, product authoring and offer editing,
  delivery coverage, customer accounts, cart/checkout/orders, stock reservations, notifications,
  returns/support, hardening and deployment/restore rehearsals. All readiness conclusions remain NO.

### COM-01A — persisted authenticated customer cart — VERIFIED bounded slice (2026-10-13)

- Additive checksum-locked `000009_customer_cart.sql` stores customer carts and offer references.
  `@atlas/commerce` supplies scoped cart reads and serialized quantity writes, explicit version
  conflicts, 50-line/99-unit technical bounds, current publication/stock/price checks, and atomic
  rollback. The cart neither reserves seller stock nor creates orders or accepts payment.
- Protected API derives ownership only from the authenticated customer principal with
  `cart.manage`. Anonymous, seller/admin and owner-override attempts are rejected. Shared
  contracts bound all input/output quantities, identifiers, versions and integer-centime totals.
- Customer Web adds local customer login, product add-to-cart, persisted cart, quantity/removal,
  unavailable/stock/conflict/empty/error states, subtotal excluding delivery, and explicit checkout
  unavailability. Customer logout revokes the persisted current session family before clearing its
  cookie (or asks for retry on a service failure). No browser-local cart authority exists.
- The synthetic identity harness adds one fixed LOCAL/TEST customer with only `cart.manage`;
  normal production identity remains fail-closed. Real account enrollment/MFA is still absent.
- `pnpm verify` passed all 12 workspace builds and required formatting/lint/type/unit/contract
  gates on 2026-10-08, including 3 commerce and 6 customer-web unit cases. Full integration passed
  39 cases: database 10, identity adapter 9, catalog 7, commerce 7, API 6. Commerce tests cover
  persistence, isolation, concurrent/stale writes, stock/publication changes, rollback and bounds.
- Persistent LOCAL applied `000009`; foundation verification passed and all 9 migration checksums
  matched. No previous migration was edited. Catalog/cart drift verification still needs extension
  beyond the foundation verifier; disposable integration checks are not a complete drift audit.
- Browser checks on 2026-10-08/13: quantity survives reload and a fresh session; two sellers stay
  separate; exact-centime subtotal; rejection above stock; stale-tab conflict without overwrite;
  removal to empty; customer logout; Arabic navigation and 320px cart without horizontal overflow.
  No warnings/errors observed in the cart-page console. No whole-product e2e/a11y claim is made.
- Payment arrangement and same-seller shipping calculation questions remain unanswered. Any next
  checkout policy fixture must stay explicitly synthetic/local; do not activate real COD, invent
  geographic coverage or imply actual seller delivery/collection approval.
- Local instructions: [LOCAL-TESTING.md](LOCAL-TESTING.md). Checkout, order routing/reservations,
  notifications, seller processing, returns/support and all release/approval gates remain open.

### COM-01B — synthetic checkout, split orders and seller inbox — VERIFIED bounded slice (2026-10-14)

- Additive `000010_synthetic_order_routing.sql` is applied to persistent LOCAL and is now
  checksum-locked. It adds immutable checkout/customer-order/seller snapshots, seller-isolated
  stock reservations, one-way release/history constraints, inbox/deadline indexes and granular
  order permissions. All ten migrations match; the foundation schema verifier passes. Extending
  drift verification to the catalog/commerce controls remains a separate hardening task.
- Server-priced, expiring quotes group items by seller. Confirmation locks and revalidates the
  cart and offers, creates one customer order and separate seller orders, reserves seller-owned
  stock, clears the cart, and writes audit plus routing outbox records in one transaction.
  The server-issued quote ID is the stable idempotency key. Duplicate confirmation returns the
  original order, including after expiry/closure; another customer cannot retrieve the quote/order.
- Awaiting seller orders can be rejected, customer-cancelled, or expired. Version checks and
  transaction locks protect independent seller states and release reservations exactly once.
  The loopback fixture retries due expiry every five seconds and drains in-flight work at shutdown.
  Seller rejection is currently a generic rejection event; selectable reason codes remain open.
- Production-built Customer Web now has `/checkout/[quoteId]`, `/orders`, `/orders/[orderId]`,
  a conditional cart checkout action, per-seller shipping totals and scoped cancellation.
  Seller Center has `/orders`, `/orders/[sellerOrderId]` and confirmed rejection. French/Arabic,
  RTL, auth/service/conflict/missing states and server-side validated responses are included.
- This is **only a synthetic order-routing fixture**, requiring `ATLAS_LOCAL_CHECKOUT=true`
  in addition to local account gates. Normal production composition does not enable checkout.
  No real address, payment, courier action or shipment is taken. The explicitly labeled fixture
  uses the maximum offer delivery fee once per seller, a ten-minute quote and one-hour response
  deadline. These are test parameters, not owner-approved commercial shipping/acceptance policies.
- `pnpm verify` passed formatting, lint, types, unit/contract checks and all 12 workspace builds:
  API 65 unit cases, commerce 5, Customer Web 7, Seller Center 6, plus existing suites.
  `pnpm test:integration` passed **48** cases (database 10, identity 9, catalog 7, commerce 15,
  API 7), including duplicate/concurrent checkout, no overselling, immutable history, foreign
  access, partial rejection, exactly-once release, expiry, outbox failure rollback and an HTTP journey.
  The rate-limit route inventory now rejects malformed operation identifiers after catching and
  fixing an inbox 503. `pnpm smoke` passed; production dependency audit found no known vulnerabilities.
- Browser evidence: two-seller earbuds checkout displayed 4,700.50 + 7,400.00 = 12,100.50 DZD
  including test shipping; customer confirmation persisted; Maison Plus saw only its own order;
  seller stock fell 7→6 and returned 6→7 on rejection; the other seller remained awaiting until
  independently cancelled by the customer; retrying the original quote returned the same order.
  Arabic customer/seller detail screens used document RTL with no overflow at 320px. Desktop seller
  detail was inspected at 1280px. Expired 30-minute sessions correctly refused mutations; fresh login
  resumed the saved order. No full automated browser/a11y/security-suite pass is claimed.
- Persistent test evidence: customer order `c24d0003-33c5-4e6d-8520-e64e0a7686ff`, Maison Plus
  seller order `32e92548-40d3-4fb8-b811-1dc07eb5f313` rejected, TechWay seller order
  `c7c259c0-3517-4aa5-a712-8b50be7aedad` cancelled. Cart cleared; original stock restored.
- Still missing: seller acceptance/preparation/dispatch/delivery and attributed evidence, rejection
  reasons, real delivery coverage/address/policy, notification dispatch/retry adapters, production
  accounts, support/returns/disputes, deployment/restore/rollback and commercial approvals.
  All three readiness conclusions remain **NO**. Local testing instructions have the opt-ins.

### FUL-01A — seller processing and attributed receipt — PARTIAL verification (2026-10-20)

- Code now covers scoped acceptance, preparation, synthetic dispatch references, seller-reported
  delivery/failure, separate customer receipt confirmation, rejection reasons and immutable history.
  Customer and seller screens expose these stages in French/Arabic. Stock is consumed at dispatch,
  not returned automatically after a reported delivery failure. No actual provider is contacted.
- Migration `000011` was applied to persistent LOCAL on 2026-10-18; all eleven checksums match,
  rechecked on 2026-10-20. It is now immutable: use additive migrations for further changes.
  A fresh/upgrade test found that `000011` initially dropped the snapshot constraint instead of
  the awaiting/closed-state constraint. This was corrected before application, with a
  regression check that snapshot ownership and acceptance-deadline constraints remain present.
- `pnpm verify` passed formatting, lint, types, unit/contract tests and all 12 builds on 2026-10-18.
  Full integration passed **57** cases: database 10, identity 10, catalog 7, commerce 22, API 8.
  Fresh/populated upgrade, concurrent acceptance/cancellation, dispatch consumption, failed
  delivery, rejection reasons, immutable attributed history, isolation and outbox rollback pass.
  `pnpm db:verify`, migration status and `pnpm smoke` passed; the local apps were restarted.
- Full-suite testing exposed a logout/refresh race: transaction-start revocation could predate
  a concurrently issued successor. Revocation now uses one wall-clock timestamp after acquiring
  locks; a deterministic integration regression passes. Test teardown no longer force-kills
  closing pool connections in the affected suites. No production constraint was weakened.
- Browser journey passed on 2026-10-18: two-seller checkout → Maison Plus acceptance → preparation
  → synthetic dispatch → seller delivery report → separate customer receipt confirmation.
  TechWay remained independent and was customer-cancelled. History distinguishes seller/client
  attribution. Arabic customer detail has document RTL and no overflow at the 320px viewport
  override (reported layout width 319px). French states/forms were inspected in the browser.
- Saved customer order `655e7502-4f82-4b06-8d4a-fe4e05d0f0e0`; Maison Plus seller order
  `08a65687-1bff-47de-a0a1-9cad7ce56f06` is customer-confirmed DELIVERED with
  `TEST Carrier` / `TEST-20261018-001`; TechWay `12f5bc54-5ec7-4c10-866d-02a87ac2cedf` is CANCELLED.
  Do not erase this history or restore stock consumed by the simulated shipment.
- Remaining manual evidence: rejection reason submission, failed-delivery UI, old rejected-order
  detail, seller Arabic/mobile and desktop layouts. An approval-review usage limit interrupted
  browser testing on 2026-10-18; access to port 3002 was still denied on 2026-10-20. Explicit
  approval to resume that target has been requested. Do not bypass the browser block.
- This is synthetic fulfillment verification, not actual courier integration, COD collection,
  production login or a commercial release. Automated browser/a11y/security suites remain open.

### COM-01C — destination shipping and seller-collected COD model — PARTIAL verification (2026-10-21)

- Additive migration `000012_seller_destination_rates.sql` stores one versioned seller rate per
  destination, coverage enablement and the responsible collector (seller or seller's courier).
  Updates require an approved seller, scoped permissions, MFA, exact money and expected version;
  identity is immutable, rates are disabled rather than deleted, and audit/outbox commit together.
- New quotes use `local-destination-cod-v2`: exactly one configured charge per seller/order at
  the selected destination, regardless of item count. Missing/disabled coverage fails closed.
  Placement rechecks configuration under locks; stale quotes cannot reserve stock or place orders.
  Orders retain destination/rate version/collector snapshots; old placed quotes remain replayable.
- Seller Center `/delivery` exposes French/Arabic coverage, rate and collector forms. Customer
  carts require a destination; quote and order screens show the snapshot. Catalog prices now
  explicitly exclude shipping instead of displaying the obsolete per-offer shipping fixture.
- Only two explicitly fictional destinations are seeded, in an inactive, provenance-checked
  dataset. No seller rates are seeded by startup. There is still no actual address, payment,
  collection evidence or delivery-provider integration. Normal production checkout stays disabled.
- On 2026-10-20, `pnpm verify && pnpm test:integration` passed formatting, lint, types,
  unit/contracts, all 12 workspace builds and **67** integration cases: database 10, identity 10,
  catalog 7, commerce 31, API 9. Repeated commerce/API integration also passed (31 + 9).
  Coverage includes rate isolation, concurrent edits, exact retry, outbox rollback, multi-item/
  multi-seller charges, stale quotes, revoked coverage and immutable placed-order snapshots.
- Persistent LOCAL has all **12** migrations applied with matching checksums. `pnpm db:verify`
  and `pnpm smoke` passed; the API/customer/seller processes were restarted with this build.
  The foundation verifier is not yet a complete catalog/commerce schema-drift verifier.
- Customer browser check on 2026-10-20: fresh login, product price excluding delivery, one air
  fryer added, fictional destination A selected, and the expected unsupported-coverage error.
  No order/reservation was created; the cart retains the item. Seller rates remain unset.
- Positive shipping configuration → quote → order browser evidence and new Arabic/mobile views
  remain pending. Port 3002 browser access remains approval-blocked; do not bypass it or substitute
  API tests for UI evidence. Executable end-to-end/accessibility suites remain missing; see
  SEC-01 below for the subsequently added executable security regression baseline.

### IAM-01C — web sign-out revokes persisted sessions — VERIFIED bounded slice (2026-10-21)

- Seller Center now revokes the authoritative current session family before deleting its cookie.
  Previously it only deleted the browser cookie. French/Arabic pending, retryable failure and CSRF
  feedback are present. A service failure retains the cookie so server revocation can be retried.
- Both customer and seller clients require exactly one schema-valid current family. Missing or
  ambiguous results cannot report success. Only HTTP 401 means an already unusable credential;
  HTTP 403, throttling, malformed success and service failures cannot discard the logout retry path.
  Requests are uncached, bounded and reject redirects; raw credentials are not logged.
- Added nine client regression cases and one real HTTP/PostgreSQL seller-logout case. The latter
  proves the revoked token cannot read sessions/offers/orders while another seller device and
  the customer remain usable. The customer HTTP client is separated from Next cookie access for
  direct unit testing; server actions still own cookie mutation and origin checks.
- `pnpm verify && pnpm test:integration && pnpm db:status && pnpm db:verify && pnpm smoke`
  passed on 2026-10-21: 12 builds; **68** integration cases (database 10, identity 10, catalog 7,
  commerce 31, API 10); all 12 applied migration checksums match. No new migration was needed.
- Customer browser checks passed against the rebuilt app: French login → persisted cart → logout;
  Arabic login → persisted cart and unsupported-destination feedback; 320px RTL with document
  width 320px. During a brief local API outage, logout showed the Arabic retry alert and retained
  its action. After API restart, retry completed logout. No order/payment/shipment was created.
- API and both web apps are running the verified builds. The viewport override was reset. Seller
  logout UI and layout verification remain pending due to the existing port 3002 browser block;
  this checkpoint's seller evidence is client tests, real API integration and build/type checks.
  Production identity/provider/MFA/recovery are still not implemented.

### SEC-01 — executable security regression baseline — VERIFIED bounded suite (2026-10-21)

- `pnpm test:security` now executes real suites in six required packages: API, customer web,
  Seller Center, identity domain, PostgreSQL identity adapter and platform. It is no longer an
  empty discovery placeholder. Tests cover the implemented authentication/authorization boundaries,
  object isolation, session replay/revocation, web mutation origins, safe errors and redacted logs.
- The runner refuses a missing/empty package task; four tooling regressions protect this gate.
  `DATABASE_URL` is explicitly passed through for disposable database tests; security execution
  is uncached. The existing build dependencies ensure tests do not silently use stale compiled code.
- `pnpm verify && pnpm test:security` passed after adding the task wiring: **150** security
  regression cases, zero failures. These reuse existing unit/integration cases plus the new logout
  regressions; the counts are overlapping evidence, not 150 additional unique tests.
- The local CI definition now runs this security gate. Hosted CI is still unverified: this folder
  has no Git repository/remote. `pnpm install --frozen-lockfile --offline` passed with the existing
  dependency graph; no dependency or lockfile changes were required.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities and `pnpm peers check`
  reported no conflicts on 2026-10-21. This point-in-time advisory check is not a penetration test.
- Coverage and exclusions are in [SECURITY-REGRESSION.md](SECURITY-REGRESSION.md). This is not a
  penetration-test sign-off or complete production security assessment. Executable browser/a11y
  suites, real provider controls, recovery/deployment rehearsals and remaining MVP features are open.
- `pnpm test:e2e` and `pnpm test:ui` were checked on 2026-10-21: both intentionally exit 2 because
  they still have no executable package tasks. They produced no passing browser/a11y evidence.

### OUT-01A — durable outbox queue — VERIFIED infrastructure slice (2026-10-22)

- `packages/database/src/outbox-queue.ts` reuses existing delivery metadata; no migration,
  dependency, application UI or worker activation changed. Persistent local events were not consumed.
- Atomic `SKIP LOCKED` claiming, unique lease fencing, wall-clock expiry, bounded batches,
  capped exponential backoff/jitter, durable terminal failures and final-attempt crash recovery
  are implemented. Unpublished/failed predecessors block their own aggregate, not unrelated work.
- Publication requires explicit acknowledgement of a live lease. Stale acknowledgements/failures
  cannot overwrite a replacement lease. Event envelopes remain unchanged; bigint versions retain
  exact precision. Failure inspection exposes metadata only, never payloads/provider exceptions.
- Targeted `@atlas/database` build/type compilation, lint, **3 unit tests** and **17 integration
  tests** passed (7 new outbox integration cases). Disposable databases covered concurrent claims,
  transaction visibility, ordering, retries, crash recovery and stale-worker fencing. No monorepo
  rebuild was needed or claimed; prior full-suite/security evidence is not a new run.
- Still missing: dispatcher envelope validation, durable broker confirmation adapter, consumer
  deduplication/effects, operational alerts and permission/audit-protected replay. Worker/scheduler
  remain disabled. This is persisted queue infrastructure, not working notification delivery.

### NOTIF-01A — persisted in-app inboxes — IMPLEMENTED, focused checks passed (2026-10-22)

- Customer and seller French/Arabic inboxes expose scoped immutable seller-order history,
  order links, cursor pagination, total unread counts and per-user read markers. Reading a
  notification never accepts an order, alters fulfillment, changes payment or moves stock.
- Additive migration `000013_order_notification_reads.sql` is applied; all 13 migration
  checksums match. Idempotent read timestamps cannot be rewritten or deleted.
- Contracts, commerce, API and both web builds, frontend typechecks and targeted lint passed.
  Three focused database/API/access-inventory cases passed, covering ownership isolation,
  concurrent reads, pagination, state integrity, anonymous/staff denial and scope injection.
- This is in-app history presentation, not email/SMS/push delivery or an outbox consumer.
  Broker dispatch and worker/scheduler activation remain incomplete and disabled.
- The owner prioritized working features and deferred broad verification. Notification browser,
  accessibility and release evidence remain pending; no new full-suite pass is claimed.

### COM-01D — immutable delivery-contact capture — IMPLEMENTED, focused checks passed (2026-10-23)

- New quotes require recipient, phone, street and city; French/Arabic checkout reviews these
  details before placement. Customer and scoped seller order details expose the same saved values.
- Reuses the existing immutable quote JSON and ownership checks; no migration or data reset.
  Historical orders and placement retries remain readable. Unplaced quotes missing contact must
  be replaced. Contact never changes shipping eligibility or the destination's configured charge.
- Contact is excluded from event, audit and notification payloads; structured-log redaction
  covers the complete contact and individual fields. Invalid formats and ownership injection fail.
- Targeted lint, contracts/commerce/platform/API builds and both web builds passed. **42 tests**
  passed: 6 unit/contract/logging, 26 commerce/delivery integration and 10 API integration.
  Coverage includes access isolation, immutability, legacy compatibility, idempotency and stock.
- Synthetic data only. Format checks do not verify a recipient, phone, real address or coverage.
  Address books, verified geography/contacts, retention policy and browser/a11y evidence remain open.
  Broad verification stays deferred per the owner; commercial readiness is unchanged.

### Seller edits, order support and reference shipping — focused checks passed (2026-10-23)

- Seller offer detail/edit changes price, unreserved stock and handling without publishing an
  unreviewed offer or rewriting existing order snapshots. CAS, ownership and reservation limits apply.
- Customer return/help conversations, seller replies, customer closure/reopening/escalation and
  staff escalation resolution are persisted with immutable messages, idempotent actions and
  atomic audit/outbox evidence. This is not physical return handling or proof of a COD refund.
- Shipping contains 69 wilayas / 1541 communes derived from official ONS/JO sources. Wilaya base
  rates cover their communes; explicit commune prices or exclusions override the base. Sellers
  can restore inheritance. No prices are seeded. Checkout charges once per seller and rejects
  stale rate quotes; placed orders preserve their original terms.
- See [location provenance](../../tools/locations/README.md). Reference geography is inactive
  preview data; synthetic orders and commercial enablement remain separate. No courier coverage
  or real address validation is inferred from the register.
- 35 commerce/delivery/support integration, 19 API/catalog-route checks and 6 focused
  contract/logging tests passed. Earlier focused catalog (9) and offer-input (4) tests passed.
  Targeted lint/typechecks and contracts/commerce/platform/API plus both web builds passed.
- Additive migrations 000014–000016 applied locally; all 16 checksums verified, repeat migration
  applied nothing. Local API/customer/seller restarted without resetting orders, stock or rates.
- Seller browser verification remains blocked pending explicit permission for port 3002.
  Launch completion now requests release verification; the earlier broad-verification deferral
  no longer controls. Hosting/domain/auth provider choices remain unanswered.
- Customer French browser verified wilaya selection, matching communes and reset on wilaya change;
  narrow layout inspected without placing orders or changing cart/rates. Numeric wilaya order was
  corrected; focused regression/lint/typecheck passed and API refreshed on 2026-10-27. This is not
  full end-to-end checkout or seller-browser evidence.

## Active seller-fulfilled requirement matrix

| ID        | Requirement                                                           | Current implementation / evidence                                                                 | Status           | Next action                                                                       |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| SCOPE-01  | Seller-fulfilled product and release scope                            | User instruction, ADR-011, revised Phase 0 entry points                                           | VERIFIED         | Apply this scope to each new vertical.                                            |
| ENG-01    | Monorepo, API, migrations, contracts, CI                              | Foundation and session control plane locally verified; hosted CI and import boundaries incomplete | PARTIAL          | Verify integrated catalog changes and add remaining contract/boundary controls.   |
| IAM-01    | Identity, verified phone, MFA, recovery, sessions                     | S1-02A/B and IAM-01C verify sessions/rotation/logout; synthetic test accounts only                | PARTIAL          | Production issuance/provider/MFA/recovery remain disabled.                        |
| CAT-01    | Seller/catalog/offer publication and discovery                        | Publication/moderation and reservation-safe offer editing implemented                             | PARTIAL          | Add onboarding, full product authoring and indexed/paginated search.              |
| WEB-01    | Production responsive French/Arabic customer web                      | Next.js catalog, cart and synthetic checkout/order routes verified; prototype remains separate    | PARTIAL          | Complete account, tracking, support and policy routes.                            |
| SELLER-01 | Seller onboarding, offers, delivery configuration, order inbox        | Offers/editing, processing, wilaya defaults and commune overrides implemented                     | PARTIAL          | Verify new shipping UI; add onboarding and production permissions.                |
| COM-01    | Cart, shipping snapshots, COD eligibility, idempotent split orders    | COM-01A/B/C cover carts, split orders, stock lifecycle and configured destination-rate snapshots  | PARTIAL          | Add validated addresses/geography, approved policies, COD evidence and real auth. |
| FUL-01    | Seller acceptance, preparation, shipment, delivery attribution        | Lifecycle/API tests and primary local browser journey pass; remaining browser evidence pending    | PARTIAL          | Complete browser evidence; add production delivery/address/policy boundaries.     |
| ADMIN-01  | Moderation, orders, support, disputes, granular permissions           | Listing moderation API/UI, role checks and mutation evidence verified                             | PARTIAL          | Add seller review, order investigation and support/disputes.                      |
| RET-01    | Seller-managed cancellation/returns and refund evidence               | Return/support requests, attributed replies and escalation implemented                            | PARTIAL          | Add physical return and seller refund evidence, policies and operational review.  |
| PLAT-01   | Outbox delivery, retries, DLQ, rate limiting, hardened deployment     | Leased queue, retry/backoff and terminal failure persistence verified; runtime delivery disabled  | PARTIAL          | Add confirmed broker dispatch, consumers, alerts and authorized replay.           |
| REL-01    | Integrated tests, deployment/rollback/restore rehearsal, release pack | Integration and executable security regression baseline pass; no integrated release candidate     | PARTIAL          | Add browser/a11y suites and rehearse deployment/rollback/restore.                 |
| EXT-01    | Applicable legal/privacy/tax/hosting/security/operational approvals   | No commercial launch approvals supplied                                                           | EXTERNAL_BLOCKER | Keep a scoped evidence request pack and synthetic data only.                      |
| PAY-01    | Online payment funds flow/provider                                    | Disabled; funds recipient has not been decided                                                    | CONDITIONAL      | Resolve seller-direct versus platform-collected before enabling.                  |
| FIN-01    | Platform wallet, settlement ledger, seller payouts                    | Disabled and excluded unless approved funds flow requires them                                    | CONDITIONAL      | Do not build as an unconditional launch dependency.                               |
| WH-01     | Marketplace inventory, warehouses, procurement, physical fulfillment  | Removed by owner instruction                                                                      | OUT_OF_SCOPE     | Preserve historical material only.                                                |
| FLEET-01  | Platform courier fleet/driver app and COD custody                     | Removed by owner instruction                                                                      | OUT_OF_SCOPE     | Seller arranges delivery; platform records progress.                              |
| MOBILE-01 | Native customer/seller apps                                           | Responsive web is the launch surface                                                              | OUT_OF_SCOPE     | Separate future funding/scope decision.                                           |

## Historical baseline requirement matrix

This matrix records the earlier hybrid-marketplace assessment. The active matrix above supersedes
its scope and next-action columns. Warehouse/fleet/COD-custody and unconditional settlement rows
are not current launch blockers. Counts and paths here are historical checkpoint evidence.

| ID        | Requirement                                                            | Phase 0 source         | Implementation / evidence                                                                                                                                                                                                                             | Status             | Owner                                 | Blocker                                                              | Next action                                                                                             |
| --------- | ---------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GOV-01    | Preserve implementation vs launch authorization                        | `00`, `16`, `17`, `21` | This ledger and fail-safe flags retain the distinction.                                                                                                                                                                                               | PARTIAL            | Product/Architecture + specialists    | Named specialist sign-offs remain pending.                           | Never advance launch rows without signed evidence.                                                      |
| ENG-01    | TypeScript pnpm monorepo and boundaries                                | `15`                   | Pinned Node/pnpm/Turbo workspace, strict TypeScript, lint/format, package roots, and CI pass; explicit import-boundary lint remains.                                                                                                                  | PARTIAL            | Platform                              | None                                                                 | Add explicit import-boundary enforcement in S1-02.                                                      |
| ENG-02    | NestJS API, worker, scheduler; Next.js apps                            | `08`, `15`             | API/worker/scheduler roots exist. Production Customer Web and other apps do not.                                                                                                                                                                      | PARTIAL            | Application/Backend                   | None for technical shell                                             | Verify roots, then create production Customer Web with the catalog vertical.                            |
| ENG-03    | Versioned API/event/error contracts and compatibility                  | `11`, `12`, `13`, `15` | Canonical foundational Zod schemas/tests exist. OpenAPI generation, clients, notification schemas, registry, and breaking-change baseline remain.                                                                                                     | PARTIAL            | API/Platform                          | None                                                                 | Add OpenAPI generation and compatibility baseline in S1-02.                                             |
| DATA-01   | PostgreSQL migrations, constraints, seed, reference provenance         | `09`, `15`, `18`       | Five checksum-matched migrations, repeat run, semantic schema verifier, synthetic seed guard, and adversarial disposable-database tests pass; authoritative locations remain absent.                                                                  | PARTIAL            | Data/Backend                          | Authoritative location source/owner pending.                         | Preserve the locked migration chain; add provenance only after a source owner approves it.              |
| PLAT-01   | Reproducible local PostgreSQL/Redis/OpenSearch/storage/broker          | `08`, `18`             | Pinned, loopback-only Compose model and all five health gates pass.                                                                                                                                                                                   | VERIFIED           | Platform                              | Production products/topology remain external decisions.              | Keep LOCAL-only; production topology is a separate Stage 6 gate.                                        |
| PLAT-02   | Validated config, environment separation, safe flags/secrets           | `10`, `17`, `18`       | Known-key config and negative tests pass; payment/payout flags reject true; examples are LOCAL-only.                                                                                                                                                  | PARTIAL            | Platform/Security                     | KMS/secrets product and hosting boundary pending.                    | Add secret-provider port and explicit STAGING/PRODUCTION profiles later.                                |
| PLAT-03   | Health/readiness, correlation, logs, metrics, tracing                  | `08`, `17`, `20`       | Unit/contract/real-process smoke pass; official Prometheus client is pinned; tracing remains a no-op port.                                                                                                                                            | PARTIAL            | Platform/SRE                          | Telemetry backend and DPO review pending.                            | Add exporter and production telemetry policy in Stage 6.                                                |
| PLAT-04   | Transactional outbox/inbox, retries, DLQ, replay                       | `08`, `10`, `12`       | Constrained schema, immutable envelope, idempotency ledger, atomicity integration test exist. No dispatcher/broker adapter yet.                                                                                                                       | PARTIAL            | Backend/Platform                      | Production broker choice pending, local adapter unblocked.           | Implement deterministic broker port and worker dispatcher in S1-02.                                     |
| IAM-01    | Identity, verified phone, sessions, MFA, RBAC/ABAC, audit              | `06`, `10`, `17`       | Existing-credential principal resolution, actor/scope/assurance authorization, authoritative session families, self-session revocation, guards, audit/outbox, and negative tests are verified; issuance, phone/factors, refresh, and recovery remain. | PARTIAL            | Identity/Security                     | IdP/SMS/MFA/recovery/signing-key choices pending.                    | Implement S1-02B provider-neutral credential lifecycle and LOCAL/TEST adapters, default-deny elsewhere. |
| CAT-01    | Catalog/offers/inventory/search vertical                               | `01`, `09`, `10`, `22` | No production implementation. Prototype data is static and non-qualifying.                                                                                                                                                                            | NOT_STARTED        | Catalog/Search/Inventory              | Launch categories/restricted-goods policy; synthetic work unblocked. | Begin only after Stage 1 gate.                                                                          |
| WEB-01    | Production Customer Web preserving selected design                     | `02`, `03`, `05`, `23` | Connected synthetic prototype and browser QA cover discovery through COD confirmation and tracking; no `apps/customer-web` or production integration exists.                                                                                          | VERIFIED_PROTOTYPE | Frontend/Product Design               | Final brand/legal copy later; technical work unblocked.              | Rebuild in Next.js during catalog vertical.                                                             |
| COM-01    | Cart/checkout/COD/idempotent orders                                    | `03`, `09`, `10`, `24` | Browser-local synthetic prototype only; no authoritative cart, checkout, order, inventory, idempotency, audit, or provider implementation.                                                                                                            | NOT_STARTED        | Commerce                              | COD, tax, invoice, terms, and coverage decisions pending.            | Stage 3 after catalog gate; keep policy configurable.                                                   |
| INT-01    | Replaceable provider adapters and safe callbacks                       | `11`, `14`, `16`       | Interfaces not yet implemented; all real providers disabled/unconfigured.                                                                                                                                                                             | NOT_STARTED        | Integrations                          | Contracts, credentials, reviews, certifications.                     | Test adapters only until provider gates close.                                                          |
| OPSAPP-01 | Seller/admin/support/warehouse/courier/ops/finance apps                | `02`, `04`, `05`, `22` | Not started.                                                                                                                                                                                                                                          | NOT_STARTED        | Product-area owners                   | Operating model/staff/provider decisions.                            | Stage 4 vertical delivery.                                                                              |
| RET-01    | Returns, inspection, refunds                                           | `10`, `16`, `24`       | Not started.                                                                                                                                                                                                                                          | NOT_STARTED        | Returns/Finance                       | Counsel-approved remedy policy/accounting.                           | Stage 5, using configurable rules.                                                                      |
| FIN-01    | Immutable ledger, COD reconciliation, settlement/payout                | `09`, `10`, `16`, `24` | Not started; real payouts locked off at config and DB layers.                                                                                                                                                                                         | NOT_STARTED        | Finance Engineering/Control           | Tax/accounting/provider/commission policies.                         | Stage 5 with synthetic data and invariant tests.                                                        |
| SEC-01    | Threat models, secure SDLC, control verification                       | `06`, `17`, `19`       | Foundational redaction/config/error controls and CI audit step exist; threat models/scanning portfolio incomplete.                                                                                                                                    | PARTIAL            | Security                              | Security owner and product decisions pending.                        | Add SAST/secret/license/image/SBOM controls and vertical threat models.                                 |
| SEC-02    | Independent penetration test/retest and exercises                      | `17`, `21`             | No integrated staging candidate.                                                                                                                                                                                                                      | EXTERNAL_BLOCKER   | Security/assessor                     | Independent assessor and environment required.                       | Schedule after staging candidate.                                                                       |
| ALG-01    | Algerian entity/domain/hosting/legal/category evidence                 | `16`, `21`             | No qualifying approvals or production evidence.                                                                                                                                                                                                       | EXTERNAL_BLOCKER   | Executive/Algerian counsel/Compliance | All listed decisions pending.                                        | Default deny/off; attach scoped professional decisions before traffic.                                  |
| PRIV-01   | DPO/ANPDP/processing/rights/retention/transfers                        | `16`, `17`             | No qualifying approvals; real personal data is not authorized.                                                                                                                                                                                        | EXTERNAL_BLOCKER   | DPO/Legal/Data Governance             | DPO, filings, schedules, processors, locations.                      | Synthetic data only; implement provider-neutral controls later.                                         |
| PAY-01    | Authorized payment/certification/refund/reconciliation                 | `14`, `16`, `17`       | Electronic payments locked false; no provider adapter or credentials.                                                                                                                                                                                 | EXTERNAL_BLOCKER   | Payments/Finance/Legal/Security       | Authorized provider and full certification gate.                     | Port/test adapter only in Stage 3.                                                                      |
| LOG-01    | Contracted delivery, tracking, proof, COD custody                      | `14`, `16`, `22`       | No real courier or coverage promises.                                                                                                                                                                                                                 | EXTERNAL_BLOCKER   | Logistics/Finance/Legal/DPO           | Contracts, coverage, proof/remittance terms.                         | Canonical port and synthetic adapter in Stage 3/4.                                                      |
| I18N-01   | Arabic/French, true RTL, 320px+, accessibility, SEO/performance        | `01`, `19`, `23`       | Connected prototype has French/Arabic route parity, RTL, responsive captures, semantic labels, focus styles, and automated interaction coverage; production harness is absent.                                                                        | PARTIAL            | Frontend/Product Design/QA            | Approved legal copy and brand later.                                 | Establish production design/i18n/a11y harness with Customer Web.                                        |
| TEST-01   | Unit/integration/contract/E2E/security/resilience/performance/recovery | `19`, `24`             | Foundation, identity, authorization, HTTP, migration-drift, concurrency/idempotency, atomicity, contract, integration, and built-process smoke gates pass; broader portfolio is absent.                                                               | PARTIAL            | QA/Engineering                        | Final numeric thresholds need owners.                                | Expand E2E, accessibility, security, resilience, performance, and recovery evidence per slice.          |
| CICD-01   | CI, scans, artifacts, promotion, rollback                              | `15`, `17`, `18`       | Local CI-equivalent/audit gates pass and workflow includes integration/smoke; no Git host, registry, signing, promotion, or rollback.                                                                                                                 | PARTIAL            | Platform/DevSecOps                    | Git/CI/registry/signing choices and approvers.                       | Create hosted evidence only after a Git repository/host is authorized.                                  |
| INFRA-01  | Hardened containers, IaC, network/IAM/KMS/backups/DR                   | `18`                   | Local-only composition exists; no production infrastructure.                                                                                                                                                                                          | NOT_STARTED        | Platform/SRE/Security                 | Approved Algerian host/topology/products/RPO/RTO.                    | Stage 6 provider-neutral modules; make no compliant-host claim.                                         |
| OBS-01    | Dashboards/alerts/SLO/DLQ/runbooks/restore/repair                      | `20`, `21`             | Metrics primitives only.                                                                                                                                                                                                                              | NOT_STARTED        | SRE/Operations                        | Thresholds, destinations, on-call, DPO approval.                     | Instrument every slice; Stage 6 operations evidence.                                                    |
| REL-01    | RC, rehearsal, controlled pilot, canary, evidence pack                 | `19`, `21`             | No release candidate.                                                                                                                                                                                                                                 | NOT_STARTED        | Release manager/all owners            | All technical and external launch gates.                             | Stage 7 only after prior gates.                                                                         |

Document numbers above refer to matching files in `docs/phase-0/`.

## External decision and approval register

Apply these only within ADR-011 scope: EXT-004 settlement/payout requirements are conditional on
approved platform funds handling; EXT-005 is conditional on enabling online payments; EXT-006
concerns seller delivery arrangements/coverage and remedy evidence, not a platform fleet or COD
custody; EXT-010 needs customer/seller/support/security/platform/release owners, not warehouse or
platform-driver staff. None of the superseded physical-operation requirements blocks this release.

| ID      | Required authority/evidence                                                                               | Safe treatment while pending                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| EXT-001 | Final brand/domain, categories, pilot geography, legal entity model, budget/timeline                      | Keep Project Atlas DZ provisional; use synthetic data and configuration.          |
| EXT-002 | Algerian marketplace/e-supplier, seller, goods, remedies, policies, records, CNRC/domain/hosting opinions | Default deny unreviewed paths; never present engineering notes as legal approval. |
| EXT-003 | DPO, ANPDP, processing register, transfers, rights, retention/deletion, cookies/SDKs, proof/GPS/documents | Synthetic data only; minimize fields; no production transfer.                     |
| EXT-004 | Tax/invoice/principal-agent/commission/COD/settlement/payout accounting                                   | Integer DZD minor units later; no guessed rates or real money movement.           |
| EXT-005 | Authorized payment/acquirer, credentials, certification, settlement/refund evidence                       | Electronic payments remain server-side false.                                     |
| EXT-006 | Courier contracts, coverage/rates/proof, COD custody/remittance, SLAs                                     | Test adapters only; publish no real delivery promises.                            |
| EXT-007 | Identity/SMS/MFA/recovery/KMS/break-glass decisions and threat-model acceptance                           | Provider-neutral ports and LOCAL/TEST adapters only.                              |
| EXT-008 | Algerian production host, topology, CI/registry/observability products, capacity/cost                     | Local/provider-neutral engineering only.                                          |
| EXT-009 | Approved SLOs, RPO/RTO, capacity and stop/rollback thresholds                                             | Instrument and measure; treat Phase 0 values as proposed.                         |
| EXT-010 | Named security/finance/ops/support/warehouse/courier/compliance/platform/release owners                   | Owner cells remain role placeholders; release cannot advance.                     |

## Command contract

First local setup:

```bash
corepack pnpm install --frozen-lockfile
cp .env.example .env.local
```

Stable root commands:

| Purpose                   | Command                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Format check/write        | `pnpm format:check` / `pnpm format`                                                |
| Lint/typecheck            | `pnpm lint` / `pnpm typecheck`                                                     |
| Unit/contract/integration | `pnpm test:unit` / `pnpm test:contract` / `pnpm test:integration`                  |
| E2E/UI/security suites    | `pnpm test:e2e` / `pnpm test:ui` / `pnpm test:security`                            |
| Production build          | `pnpm build`                                                                       |
| Fast CI-equivalent gate   | `pnpm verify`                                                                      |
| Local dependencies        | `pnpm infra:up` / `pnpm infra:status` / `pnpm infra:down`                          |
| Database                  | `pnpm db:migrate` / `pnpm db:status` / `pnpm db:verify` / `pnpm db:seed:synthetic` |
| API smoke                 | `pnpm smoke`                                                                       |

`infra:down` retains volumes. Destructive volume deletion is deliberately not automated.

## Current risks and exact resume point

1. The workspace is not a Git repository, so CI/ownership/history evidence cannot yet run as
   a hosted pull-request gate.
2. S1-01 is locally verified, but the GitHub workflow has no hosted run because this directory
   is not a Git repository and no remote is configured.
3. The initial audit trigger protects application history from ordinary mutation but is not
   tamper evidence against a database owner/superuser; Stage 6 requires separated roles and
   externally retained integrity checkpoints.
4. The location schema is ready, but no dataset may be activated without authoritative
   source provenance and ownership.
5. Local OpenSearch security is disabled and every port is loopback-bound; this configuration
   is prohibited outside LOCAL.
6. Identity provider, SMS, MFA/recovery, signing-key custody, distributed rate-limit policy/store,
   and break-glass choices remain external blockers. The verified S1-02A self-session boundary
   accepts only an injected verifier and limiter; default composition denies those requests.
7. The Phase 0 event-version contradiction is resolved in checksum-locked migration `000002`:
   event names are unversioned and `eventVersion` carries the schema version. The dispatcher and
   compatibility registry still remain to be implemented and evidenced.
8. Refresh rotation/replay is internally verified; public issuance/refresh/provider controls and
   runtime least-privilege grants remain incomplete.
9. Catalog publication/discovery and Seller Center are verified above with a separately opted-in
   loopback synthetic identity harness; this is not production login/MFA.
10. The previous smoke/audit approval-capacity block cleared; both authorized reruns passed
    on 2026-10-08. Keep this evidence separate from still-unimplemented release gates.

**Exact next task:** obtain hosting/domain/auth provider choices for real identity and deployment,
then complete onboarding, product photos/revisions, operational return/refund evidence and release checks.
Offer editing, support conversations, contact snapshots and reference shipping configuration exist;
verified contacts/addresses, real seller coverage and address books remain open. In-app inboxes exist;
external notification dispatch still needs envelope validation and durable broker confirmation.
Worker/scheduler delivery remains disabled. Complete
FUL-01A, COM-01C, notification and Seller Center logout browser evidence once port 3002 access is
explicitly approved, and add executable browser/a11y suites without bypassing the blocked target.
Customer logout, outage/retry and Arabic cart checks passed on 2026-10-21.
Migrations `000001`–`000016` are applied and
checksum-locked; do not edit them. COM-01A/B are complete bounded synthetic checkpoints; COM-01C
has automated evidence and the customer coverage-denial check, not a complete UI journey.
Keep normal identity fail-closed and any synthetic
customer account explicitly isolated to LOCAL/TEST. Seller/courier-collected COD and one configured
charge per seller/order/destination are approved; actual coverage/rates, acceptance deadlines,
online payments and launch approval are not. Never introduce platform funds custody. Verify each
bounded journey through production apps/API and record its own evidence before advancing.
