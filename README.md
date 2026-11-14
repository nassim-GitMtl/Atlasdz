# Project Atlas DZ

Project Atlas DZ is the working codename for an Algeria-first, bilingual, seller-fulfilled marketplace. Customers buy through Atlas DZ; each seller receives its own orders and handles packing, shipping, and delivery. The owner revised the business model and authorized implementation on 2026-10-06; [ADR-011](docs/decisions/ADR-011-seller-fulfilled-marketplace.md) records the controlling scope decision.

A Customer Web visual prototype is implemented in [`prototypes/customer-web`](prototypes/customer-web/README.md). Current production implementation and verification evidence belong in the [readiness ledger](docs/implementation/PRODUCTION-READINESS.md).

The production engineering foundation is now implemented and locally verified: a pinned
pnpm/Turborepo workspace, NestJS API/worker/scheduler roots, shared contracts and platform
controls, PostgreSQL migrations, transactional outbox/inbox persistence, synthetic-only seed
data, and loopback-only local dependencies. Product verticals and production deployment
infrastructure are still incomplete; the prototype is not deployable marketplace code.

Start with the [seller-fulfilled scope](docs/phase-0/22-scope-phasing.md), then the [Phase 0 architecture package](docs/phase-0/README.md). Marketplace-owned inventory, warehouses, a delivery fleet, platform goods/COD custody, and unconditional seller-settlement systems are out of scope for this release. Seller stock reservations and delivery visibility remain required.
Implementation state and exact evidence are recorded in
[`docs/implementation/PRODUCTION-READINESS.md`](docs/implementation/PRODUCTION-READINESS.md).

## Local foundation

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm infra:up
pnpm db:migrate
pnpm db:verify
pnpm db:seed:synthetic
pnpm verify
pnpm test:integration
pnpm test:security
pnpm smoke
```

The workspace pins and automatically provisions Node.js 24.21.0 for pnpm-run commands. Local
data and credentials must remain synthetic.

The backend-connected customer catalog (port 3001) and Seller Center (port 3002) now support
the synthetic seller-offer → admin-approval → customer-discovery journey, saved carts,
and destination-based test checkout → isolated seller processing → customer-confirmed receipt,
with rejection/cancellation, attributed history and stock reservations. Follow the exact
[local testing guide](docs/implementation/LOCAL-TESTING.md); port 4173 is the older prototype.
Seller-configured destination charges and seller/courier-collected COD responsibility are modeled
under [ADR-012](docs/decisions/ADR-012-cod-and-destination-shipping.md). Checkout remains explicitly
LOCAL/TEST-only with fictional destinations; production identity, actual addresses/coverage,
COD evidence, notifications, returns and deployment operations remain incomplete. No real purchase,
payment or shipment is enabled. See the ledger for implemented versus browser-verified boundaries.

## Current gate

The owner approved the product and architecture baseline and selected Product Design direction 2, “Mobile Bazaar,” as the Customer Web visual reference. Safe implementation and testing proceed under the revised seller-fulfilled scope. Applicable specialist security, finance, seller/delivery operations, Algerian legal/accounting, platform, and data-governance approvals remain commercial release gates. See the [approval checklist](docs/phase-0/00-executive-summary-and-approval-gate.md).

## Important notice

The compliance material is an engineering checklist, not legal or accounting advice. Qualified Algerian legal, accounting, payments, privacy, and logistics specialists must validate the production design and launch configuration.
