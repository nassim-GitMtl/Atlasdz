# Project Atlas DZ — Phase 0 Architecture Package

Status: **Historical architecture baseline amended by the owner-approved seller-fulfilled scope**  
Baseline date: 2026-10-02; scope revision: 2026-10-06  
Implementation status: see the [readiness ledger](../implementation/PRODUCTION-READINESS.md) for current code and exact verification evidence.

Project Atlas DZ is the working codename for an original Algeria-first seller-fulfilled marketplace. Sellers receive and fulfill their own orders; Atlas DZ operates shopping, order routing, visibility, moderation, and support. The name, trademark, domain, and final visual identity require clearance before launch.

Read [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and the revised [scope phasing](22-scope-phasing.md) first. They supersede conflicting hybrid-marketplace, warehouse, fleet, platform-inventory, platform-cash-custody, mandatory settlement, and nine-application requirements throughout this package. Detailed historical models remain available for reference and reuse; excluded capabilities are not launch blockers. The required applications are responsive Customer Web, Seller Center, and Marketplace Admin/Support, which may share an application with separate permissions.

The separate [`prototypes/customer-web`](../../prototypes/customer-web/README.md) workspace validates the selected visual direction only; it is not proof of a production purchase flow or provider integration.

## Approval rule

The project owner authorized prototyping on 2026-10-02 and safe implementation/testing of the revised model on 2026-10-06. Earlier blanket implementation stops are superseded for that authorized work. Production launch and affected real-provider paths still require applicable security, finance, seller/delivery operations, platform, privacy, and qualified Algerian legal/accounting evidence. No professional approval is implied by the product decision.

## Artifact index

| Requirement                                             | Artifact                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Current business-model authority                        | [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) |
| A. Product requirements                                 | `01-product-requirements.md`                                    |
| B. Full sitemap                                         | `02-sitemap.md`                                                 |
| C. Customer journeys                                    | `03-customer-journeys.md`                                       |
| D–E. Seller and admin journeys                          | `04-seller-and-admin-journeys.md`                               |
| F–I. Order, payment, shipping, return/refund lifecycles | `24-domain-lifecycles.md`                                       |
| J. Complete ERD                                         | `09-data-model-and-erd.md`                                      |
| K. Backend module architecture                          | `10-backend-modules.md`                                         |
| L. API architecture and inventory                       | `11-api-architecture-and-inventory.md`                          |
| M. Security architecture                                | `17-security-architecture.md`                                   |
| N. Infrastructure architecture                          | `18-infrastructure-and-deployment.md`                           |
| O. Algeria compliance checklist                         | `16-algeria-compliance-checklist.md`                            |
| P. Integration architecture                             | `14-integration-architecture.md`                                |
| Q. Every-screen inventory                               | `05-screen-inventory.md`                                        |
| R. Permission matrix                                    | `06-roles-and-permissions.md`                                   |
| S. Event catalog                                        | `12-event-catalog.md`                                           |
| T. Notification catalog                                 | `07-notification-catalog.md`                                    |
| U. Error catalog                                        | `13-error-code-catalog.md`                                      |
| V. Test strategy                                        | `19-testing-strategy.md`                                        |
| W. Deployment strategy                                  | `18-infrastructure-and-deployment.md`                           |
| X. Monitoring strategy                                  | `20-observability-and-operations.md`                            |
| Y. MVP / Phase 2 / Phase 3                              | `22-scope-phasing.md`                                           |
| Original design-system specification                    | `23-product-design-system.md`                                   |
| Production rollout                                      | `21-production-rollout.md`                                      |
| Complete repository structure                           | `15-repository-structure.md`                                    |
| Mandatory feature/screen specifications                 | `25-delivery-specification-templates.md`                        |

## Reading order

1. ADR-011 and revised scope phasing.
2. Executive summary, approval gate, and PRD.
3. Journeys, sitemap, screen inventory, and design system.
4. Domain lifecycles, data model, modules, APIs, events, permissions, and integrations.
5. Compliance, security, infrastructure, testing, observability, and rollout.

## Traceability rule

Every implemented feature must trace from requirement → screen or API → role permission → domain invariant → state transition → database change → event → notification → audit record → test → metric. A screen rendering is not completion.

## Document conventions

- `MUST`, `MUST NOT`, and `REQUIRED` are release-blocking only for applicable in-scope capabilities under ADR-011. Excluded historical capabilities do not become release requirements through this wording.
- `SHOULD` requires a documented exception.
- `MAY` is optional.
- Money is represented in integer minor units with ISO currency code; DZD uses two decimal places (centimes), while customer presentation follows business and provider rules.
- Public identifiers are opaque UUID/ULID-style values plus separate human-readable business references.
- All policy values are configuration, not source-code constants.
- Any legal interpretation is a design assumption pending qualified Algerian counsel and accounting review.
