# Full Application Sitemap

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

Routes are logical contracts. Final localized URL strategy is an approval decision; APIs and stored entities remain locale-neutral. Customer pages MAY use `/ar` and `/fr` prefixes after SEO review. Internal routes use opaque entity IDs and backend permission checks.

## 1. Customer Web

### Discovery and policy

| Route                 | Page                            |
| --------------------- | ------------------------------- |
| `/`                   | Homepage                        |
| `/search`             | Search results                  |
| `/category/[slug]`    | Category listing                |
| `/product/[slug]`     | Product and offer detail        |
| `/brand/[slug]`       | Brand storefront                |
| `/store/[sellerSlug]` | Seller storefront               |
| `/deals`              | Deals                           |
| `/new-arrivals`       | New arrivals                    |
| `/best-sellers`       | Best sellers                    |
| `/featured`           | Featured products               |
| `/help`               | Help center                     |
| `/help/[articleSlug]` | Help article                    |
| `/contact`            | Contact and support entry       |
| `/about`              | About the marketplace           |
| `/terms`              | Terms                           |
| `/privacy`            | Privacy notice and center entry |
| `/returns-policy`     | Returns policy                  |
| `/shipping-policy`    | Shipping policy                 |
| `/seller-policy`      | Seller policy                   |
| `/accessibility`      | Accessibility statement         |

### Identity and account recovery

| Route              | Page                              |
| ------------------ | --------------------------------- |
| `/login`           | Sign in                           |
| `/register`        | Customer registration             |
| `/verify-phone`    | Phone OTP verification            |
| `/verify-email`    | Email verification                |
| `/forgot-password` | Recovery request                  |
| `/reset-password`  | Password reset                    |
| `/auth/challenge`  | Additional verification challenge |

### Customer account

| Route                                | Page                                    |
| ------------------------------------ | --------------------------------------- |
| `/account`                           | Account overview                        |
| `/account/profile`                   | Personal profile                        |
| `/account/security`                  | Password, MFA/OTP, sessions and devices |
| `/account/addresses`                 | Address book                            |
| `/account/addresses/new`             | Add address                             |
| `/account/addresses/[id]`            | Edit address                            |
| `/account/orders`                    | Order history                           |
| `/account/orders/[id]`               | Order detail and seller groups          |
| `/account/returns`                   | Returns list                            |
| `/account/returns/new/[orderItemId]` | Return request                          |
| `/account/returns/[id]`              | Return detail and evidence              |
| `/account/refunds`                   | Refund list                             |
| `/account/refunds/[id]`              | Refund detail                           |
| `/account/wishlist`                  | Wishlist                                |
| `/account/reviews`                   | Review activity                         |
| `/account/reviews/new/[orderItemId]` | Create verified-purchase review         |
| `/account/notifications`             | Notification center and preferences     |
| `/account/support`                   | Support cases                           |
| `/account/support/new`               | New support case                        |
| `/account/support/[id]`              | Support conversation                    |
| `/account/privacy`                   | Consent, data request, deletion         |

### Cart, checkout, and public tracking

| Route                          | Page                                   |
| ------------------------------ | -------------------------------------- |
| `/cart`                        | Multi-seller cart                      |
| `/checkout/address`            | Address selection/creation             |
| `/checkout/shipping`           | Fulfillment-group delivery choices     |
| `/checkout/payment`            | Payment method                         |
| `/checkout/verification`       | COD/step-up verification when required |
| `/checkout/review`             | Final review and contractual consent   |
| `/checkout/payment-return`     | Hosted-payment return/status recovery  |
| `/checkout/confirmation`       | Confirmation                           |
| `/track-order`                 | Public tracking lookup                 |
| `/order/[publicTrackingToken]` | Tokenized public shipment view         |

## 2. Customer Mobile Application

Logical deep links: `atlasdz://home`, `/language`, `/onboarding`, `/auth/login`, `/auth/register`, `/auth/otp`, `/categories`, `/category/[slug]`, `/search`, `/search/filters`, `/product/[slug]`, `/product/[slug]/reviews`, `/store/[sellerSlug]`, `/cart`, `/checkout/address`, `/checkout/shipping`, `/checkout/payment`, `/checkout/verification`, `/checkout/review`, `/checkout/confirmation`, `/orders`, `/orders/[id]`, `/orders/[id]/tracking`, `/returns`, `/returns/new/[orderItemId]`, `/returns/[id]`, `/refunds/[id]`, `/wishlist`, `/notifications`, `/account`, `/account/profile`, `/account/addresses`, `/account/security`, `/account/privacy`, `/support`, `/support/new`, `/support/[id]`.

## 3. Seller Center

| Route group                        | Pages                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/seller/auth/*`                   | Login, MFA enrollment, MFA challenge, recovery                                                                                                                                    |
| `/seller/onboarding/*`             | Account; business type; business details; representative; documents; settlement account; warehouse/pickup address; agreement; submission; status; additional-information response |
| `/seller`                          | Dashboard                                                                                                                                                                         |
| `/seller/products`                 | All products/offers                                                                                                                                                               |
| `/seller/products/match`           | Catalog search and match                                                                                                                                                          |
| `/seller/products/new`             | New master-product request wizard                                                                                                                                                 |
| `/seller/products/[id]`            | Offer/product detail and edit                                                                                                                                                     |
| `/seller/products/bulk`            | Bulk upload/import history and errors                                                                                                                                             |
| `/seller/products/drafts`          | Drafts                                                                                                                                                                            |
| `/seller/products/pending`         | Pending approval                                                                                                                                                                  |
| `/seller/products/rejected`        | Rejected/changes required                                                                                                                                                         |
| `/seller/inventory`                | Inventory overview                                                                                                                                                                |
| `/seller/inventory/adjustments`    | Controlled adjustments/history                                                                                                                                                    |
| `/seller/inventory/import`         | Inventory import                                                                                                                                                                  |
| `/seller/orders`                   | Order work queue                                                                                                                                                                  |
| `/seller/orders/[id]`              | Seller-order detail, pack, label, serials, handoff                                                                                                                                |
| `/seller/returns`                  | Return queue                                                                                                                                                                      |
| `/seller/returns/[id]`             | Return/evidence/inspection/dispute                                                                                                                                                |
| `/seller/performance`              | Performance and policy health                                                                                                                                                     |
| `/seller/violations`               | Warnings, restrictions, appeals                                                                                                                                                   |
| `/seller/promotions`               | Seller-funded promotions                                                                                                                                                          |
| `/seller/finance`                  | Balance summary                                                                                                                                                                   |
| `/seller/finance/transactions`     | Ledger transactions                                                                                                                                                               |
| `/seller/finance/settlements`      | Settlement history/upcoming                                                                                                                                                       |
| `/seller/finance/settlements/[id]` | Statement and payout detail                                                                                                                                                       |
| `/seller/finance/disputes`         | Financial disputes                                                                                                                                                                |
| `/seller/messages`                 | Marketplace/support messages                                                                                                                                                      |
| `/seller/notifications`            | Notifications/preferences                                                                                                                                                         |
| `/seller/support`                  | Cases                                                                                                                                                                             |
| `/seller/support/[id]`             | Case detail                                                                                                                                                                       |
| `/seller/settings/business`        | Business/profile settings                                                                                                                                                         |
| `/seller/settings/users`           | Organization members and roles                                                                                                                                                    |
| `/seller/settings/warehouses`      | Seller locations/pickup addresses                                                                                                                                                 |
| `/seller/settings/bank`            | Settlement data with step-up auth                                                                                                                                                 |
| `/seller/settings/security`        | MFA and sessions                                                                                                                                                                  |

## 4. Marketplace Admin

| Route group                                        | Pages                                                    |
| -------------------------------------------------- | -------------------------------------------------------- |
| `/admin/auth/*`                                    | Login, MFA, recovery                                     |
| `/admin`                                           | Executive dashboard                                      |
| `/admin/customers` and `/admin/customers/[id]`     | Customer search/list and 360 detail                      |
| `/admin/sellers` and `/admin/sellers/[id]`         | Seller queue/list and 360 detail                         |
| `/admin/sellers/[id]/review`                       | Seller application review                                |
| `/admin/catalog/moderation`                        | Product moderation queue                                 |
| `/admin/catalog/moderation/[id]`                   | Product review/duplicate/restriction decision            |
| `/admin/products` and `/admin/products/[id]`       | Master product management                                |
| `/admin/categories` and `/admin/categories/[id]`   | Category tree, attributes, filters, policies             |
| `/admin/brands` and `/admin/brands/[id]`           | Brand records/authorization                              |
| `/admin/orders` and `/admin/orders/[id]`           | Marketplace order oversight                              |
| `/admin/returns` and `/admin/returns/[id]`         | Return oversight/dispute                                 |
| `/admin/refunds` and `/admin/refunds/[id]`         | Refund queue/detail                                      |
| `/admin/payments` and `/admin/payments/[id]`       | Payment transactions/events                              |
| `/admin/shipping` and `/admin/shipments/[id]`      | Shipment monitoring/detail                               |
| `/admin/warehouses` and `/admin/warehouses/[id]`   | Warehouse configuration                                  |
| `/admin/promotions` and `/admin/promotions/[id]`   | Promotion rules/campaign                                 |
| `/admin/reviews` and `/admin/reviews/[id]`         | Review moderation                                        |
| `/admin/fraud` and `/admin/fraud/[id]`             | Fraud dashboard/case                                     |
| `/admin/counterfeit` and `/admin/counterfeit/[id]` | IP/counterfeit cases                                     |
| `/admin/support`                                   | Support oversight                                        |
| `/admin/finance` and `/admin/settlements`          | Read-only cross-links or permission-scoped finance views |
| `/admin/content` and `/admin/content/[id]`         | CMS pages/blocks/campaign content                        |
| `/admin/notifications/templates`                   | Localized templates and versions                         |
| `/admin/reports`                                   | Report catalog/generation                                |
| `/admin/configuration`                             | Versioned business configuration                         |
| `/admin/feature-flags`                             | Feature-flag targeting/rollout                           |
| `/admin/users` and `/admin/users/[id]`             | Internal users                                           |
| `/admin/roles` and `/admin/roles/[id]`             | Roles and permission composition                         |
| `/admin/audit` and `/admin/audit/[id]`             | Audit search/detail                                      |
| `/admin/privacy`                                   | Privacy request queue/retention tasks                    |

## 5. Customer Service Console

Routes: `/service`, `/service/search`, `/service/customers/[id]`, `/service/orders/[id]`, `/service/tickets`, `/service/tickets/[id]`, `/service/tickets/new`, `/service/returns/[id]`, `/service/refunds/[id]`, `/service/shipments/[id]`, `/service/sellers/[id]`, `/service/knowledge`, `/service/knowledge/[id]`, `/service/queues`, `/service/macros`, `/service/escalations`, `/service/notifications`, `/service/profile`.

## 6. Warehouse Management Console

Routes: `/wms`, `/wms/inbound`, `/wms/inbound/new`, `/wms/inbound/[id]`, `/wms/receiving/[id]`, `/wms/putaway`, `/wms/inventory`, `/wms/inventory/[sku]`, `/wms/movements`, `/wms/locations`, `/wms/locations/[id]`, `/wms/orders`, `/wms/picking`, `/wms/picking/[id]`, `/wms/packing`, `/wms/packing/[id]`, `/wms/shipping`, `/wms/manifests`, `/wms/manifests/[id]`, `/wms/returns`, `/wms/returns/[id]`, `/wms/cycle-counts`, `/wms/cycle-counts/[id]`, `/wms/exceptions`, `/wms/serials/[serial]`, `/wms/settings/printers`, `/wms/profile`.

## 7. Delivery/Courier Application

Logical routes: `/courier/login`, `/courier/mfa`, `/courier`, `/courier/route`, `/courier/map`, `/courier/stops/[id]`, `/courier/stops/[id]/proof`, `/courier/stops/[id]/failure`, `/courier/stops/[id]/reschedule`, `/courier/pickups`, `/courier/pickups/[id]`, `/courier/packages/[id]`, `/courier/cod`, `/courier/cod/remittance`, `/courier/history`, `/courier/incidents/new`, `/courier/offline-queue`, `/courier/notifications`, `/courier/profile`.

## 8. Operations Dashboard

Routes: `/ops`, `/ops/orders`, `/ops/fulfillment`, `/ops/inventory`, `/ops/shipments`, `/ops/delivery-map`, `/ops/cod`, `/ops/returns`, `/ops/payments`, `/ops/providers`, `/ops/sla-breaches`, `/ops/incidents`, `/ops/incidents/[id]`, `/ops/queues`, `/ops/dead-letters`, `/ops/search-health`, `/ops/notifications-health`, `/ops/capacity`, `/ops/reports`, `/ops/runbooks`.

## 9. Finance and Settlement Console

Routes: `/finance`, `/finance/payments`, `/finance/payments/[id]`, `/finance/payment-reconciliation`, `/finance/payment-reconciliation/[batchId]`, `/finance/cod`, `/finance/cod/batches`, `/finance/cod/batches/[id]`, `/finance/discrepancies`, `/finance/discrepancies/[id]`, `/finance/refunds`, `/finance/refunds/[id]`, `/finance/seller-ledgers`, `/finance/seller-ledgers/[sellerId]`, `/finance/settlements`, `/finance/settlements/new`, `/finance/settlements/[id]`, `/finance/payouts`, `/finance/payouts/[id]`, `/finance/commissions`, `/finance/commissions/[id]`, `/finance/adjustments`, `/finance/adjustments/new`, `/finance/documents`, `/finance/reports`, `/finance/close`, `/finance/audit`.

## Cross-application route safeguards

- Authentication, authorization, tenant/seller scoping, and entity-state validation occur server-side.
- Deep links resolve through allowed state transitions; they cannot bypass prior checkout/onboarding steps.
- Missing, expired, or unauthorized IDs produce localized non-enumerating errors.
- Privileged direct links retain return context after MFA/step-up auth and record access when data is sensitive.
- Every route has loading, empty, recoverable error, offline/network, forbidden, and not-found behavior where applicable.
