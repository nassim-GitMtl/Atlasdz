# Roles, Permissions, and Segregation of Duties

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

## Authorization model

Authorization is backend-enforced RBAC augmented by scope and policy checks:

`allow = permission ∧ tenant/seller/warehouse scope ∧ entity relationship ∧ state transition guard ∧ risk/step-up condition ∧ data classification rule`.

Frontend hiding is convenience only. Every denial is non-enumerating for external users and produces security telemetry; privileged denials may also create audit events. Service accounts receive narrow machine permissions, short-lived credentials, workload identity, and no interactive login.

## Canonical roles

| Role                          | Scope                                           | Purpose                                                            |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `GUEST`                       | Public                                          | Browse public catalog/policies; maintain anonymous cart            |
| `CUSTOMER`                    | Own account/orders                              | Purchase and self-service                                          |
| `SELLER_OWNER`                | Own seller organization                         | Legal owner, team/security, settlement data, all seller operations |
| `SELLER_ORG_MANAGER`          | Own seller organization                         | Day-to-day seller administration excluding owner-only controls     |
| `SELLER_OPERATOR`             | Assigned seller operations                      | Catalog, inventory, and fulfillment tasks as granted               |
| `COURIER`                     | Assigned route/packages                         | Pickup/delivery/proof/COD capture                                  |
| `CUSTOMER_SERVICE`            | Assigned queues/cases                           | Support diagnosis and communication                                |
| `CATALOG_MANAGER`             | Marketplace catalog                             | Category, brand, product moderation and integrity                  |
| `MARKETPLACE_SELLER_MANAGER`  | Marketplace sellers                             | Onboarding, performance, enforcement                               |
| `FINANCE_ANALYST`             | Finance records                                 | Reconciliation and investigation                                   |
| `FINANCE_MANAGER`             | Finance domain                                  | Rules, settlement, approval responsibilities                       |
| `WAREHOUSE_OPERATOR`          | Assigned warehouse/tasks                        | Receive, move, pick, pack, inspect                                 |
| `WAREHOUSE_MANAGER`           | Assigned warehouse(s)                           | Configure, assign, approve inventory exceptions                    |
| `LOGISTICS_MANAGER`           | Shipping network                                | Providers, rates, serviceability, shipment exceptions              |
| `MARKETING_MANAGER`           | CMS/promotions/templates                        | Localized merchandising and campaigns                              |
| `FRAUD_ANALYST`               | Risk cases                                      | Investigate and decide within policy                               |
| `PRIVACY_COMPLIANCE_REVIEWER` | Compliance cases                                | Regulated products, privacy requests, retention/legal holds        |
| `OPERATIONS_MANAGER`          | Cross-domain operational read/incident controls | SLA and incident coordination                                      |
| `SECURITY_ADMIN`              | Identity/RBAC                                   | Internal identities, roles, access review                          |
| `AUDITOR`                     | Read-only governed data                         | Independent audit and evidence export                              |
| `ADMIN`                       | Explicit assigned admin permissions             | No implicit omnipotence; composed role                             |
| `SUPER_ADMIN`                 | Emergency platform administration               | Time-bound break-glass only, not daily work                        |

## Domain permission matrix

Legend: `R` read, `C` create, `U` update/transition, `A` approve, `X` administer/configure, `O` own-scope only, `—` denied. Actual grants are atomic permission strings.

| Domain                     |          Guest |       Customer |     Seller Owner |   Seller Manager | Seller Operator |                  Support |  Catalog |  Seller Admin |        Finance |     Warehouse |       Logistics |    Fraud | Marketing |      Privacy |         Ops |    Security |  Auditor |
| -------------------------- | -------------: | -------------: | ---------------: | ---------------: | --------------: | -----------------------: | -------: | ------------: | -------------: | ------------: | --------------: | -------: | --------: | -----------: | ----------: | ----------: | -------: |
| Public catalog/search      |              R |              R |                R |                R |               R |                        R |       RX |             R |              R |             R |               R |        R |         R |            R |           R |           — |        R |
| Customer profile           |              — |          RCU-O |                — |                — |               — |                R-limited |        — |     R-limited |              — |             — |               — | R-masked |         — |  RCU-request |    R-masked |           — | R-masked |
| Customer orders            |              — |         RC/U-O |                — |                — |               — |                  RU-case |        R |             R |              R |        R-task |               R |        R |         R |     R-masked |           R |           — |        R |
| Seller organization        |              — |       R-public |           RCUX-O |            RCU-O |             R-O |                R-limited |        R |         RCUXA |      R-finance |    R-location |      R-location |   R-risk |  R-public | R-compliance |           R |           — |        R |
| Products/categories/brands |              R |              R |        RCU-offer |        RCU-offer |       RCU-offer |                        R |    RCUXA |             R |              R |             R |               R |        R | R-content |    RX-policy |           R |           — |        R |
| Inventory                  |              — | R-availability |            RCU-O |            RCU-O |           RCU-O |                        R |        R |             R |        R-value |      RCU-task |               R |        R |         — |            — |           R |           — |        R |
| Cart/checkout              | RC-own-session |          RCU-O |                — |                — |               — |                   R-case |        — |             — |              R |             — |               R |   R-risk |         — |     R-policy |           R |           — |        R |
| Payments/refunds           |              — |    R-O/request |  R-seller-impact |  R-seller-impact |               — | R-masked/request-limited |        — |             R |     RCA/UX-SoD |             — |               — |   R-risk |         — | R-compliance |    R-health |           — |        R |
| Shipping                   | R-public-token |            R-O |              R-O |              R-O |    RU-O-handoff |                   R-case |        — |             R |              R |       RU-task |           RCUXA |   R-risk |         — |     R-policy | RX-incident |           — |        R |
| Returns                    |              — |          RCU-O |      R-O/dispute |      R-O/dispute |             R-O |                   R-case |        R |           RUA |       R-refund | RU-inspection |      RU-reverse |   R-risk |         — |     R-policy |           R |           — |        R |
| Seller ledger/settlements  |              — |              — |      R-O/dispute |              R-O |               — |         R-status-limited |        — |             R |      RCUXA-SoD |             — |               — |   R-risk |         — | R-compliance |    R-health |           — |        R |
| Support                    |              — |          RCU-O |            RCU-O |            RCU-O |           RCU-O |            RCUX-assigned |   R-case |        R-case |         R-case |        R-case |          R-case |   R-case |         — |       R-case |    R-health |           — |        R |
| Fraud cases/rules          |              — |              — |                — |                — |               — |        R-outcome-limited |        — | R-seller-case | R-payment-case |             — | R-delivery-case |    RCUXA |         — |  R-oversight |    R-health |           — |        R |
| CMS/promotions             |              R |              R | RCU-seller-promo | RCU-seller-promo |               R |                        R |        R |             R |      R-funding |             — |               R |        R |     RCUXA |      R-legal |           R |           — |        R |
| Config/feature flags       |              — |              — |                — |                — |               — |               R-relevant | R-domain |      R-domain |       R-domain |      R-domain |        R-domain | R-domain |  R-domain |     R-domain |      RX-ops |           R |        R |
| Audit logs                 |              — | R-own-security |     R-own-seller |     R-own-seller |   R-own-actions |                   R-case | R-domain |      R-domain |      R-finance |   R-warehouse |     R-logistics |  R-fraud | R-content | R-compliance |       R-ops | RX-security | R-export |
| Roles/internal users       |              — |              — |     RCU-own-team |       R-own-team |               — |                        — |        — |             — |              — |             — |               — |        — |         — |            — |           R |       RCUXA |        R |

## Atomic sensitive permissions

| Permission                     | Normal holder                       | Conditions                                                                          |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `seller.approve`               | Marketplace seller manager          | No conflict; required evidence present; reason/audit                                |
| `seller.request_information`   | Marketplace seller manager          | Localized request; due date                                                         |
| `seller.suspend`               | Senior seller manager               | Step-up; reason; impact preview; notification; review date                          |
| `catalog.approve`              | Catalog manager                     | Category/restriction checks passed                                                  |
| `catalog.merge`                | Senior catalog manager              | Dependency preview; reversible mapping; dual approval for high impact               |
| `restricted_product.decide`    | Compliance reviewer                 | Legal-policy version and evidence recorded                                          |
| `order.cancel_manual`          | Order operations manager            | State/policy allows; reason; financial impact preview                               |
| `refund.request`               | Support/finance maker within limits | Eligible source, amount and reason                                                  |
| `refund.approve`               | Finance checker                     | Cannot approve own request; step-up above threshold                                 |
| `refund.retry`                 | Finance manager                     | Existing intent only; provider/idempotency protection                               |
| `ledger.adjustment.create`     | Finance maker                       | Source/evidence; balanced entry set                                                 |
| `ledger.adjustment.approve`    | Finance checker                     | Different actor; amount threshold controls                                          |
| `settlement.generate`          | Finance maker                       | Frozen eligible-entry query/version                                                 |
| `settlement.approve`           | Finance checker                     | Different actor; reconciliation green or exception approval                         |
| `payout.release`               | Finance checker                     | Step-up; approved batch; provider destination verified                              |
| `shipping.rate.publish`        | Logistics manager                   | Effective dates; simulation; dual approval if broad                                 |
| `shipment.proof.correct`       | Logistics supervisor                | Original preserved; correction reason/evidence                                      |
| `inventory.adjust`             | Warehouse manager or scoped seller  | Movement reason; version/quantity guard                                             |
| `inventory.quarantine.release` | Warehouse manager/quality role      | Inspection evidence                                                                 |
| `fraud.case.decide`            | Fraud analyst                       | Explainable reasons; policy; no prohibited traits                                   |
| `fraud.rule.publish`           | Fraud manager/checker               | Simulation, approval, flag rollout, monitoring                                      |
| `configuration.publish`        | Domain approver/platform admin      | Version, schema, impact, effective time, rollback                                   |
| `feature_flag.kill_switch`     | Operations/platform on-call         | Incident reason; alert; expiry/review                                               |
| `privacy.export.execute`       | Privacy reviewer                    | Identity verification, scope, secure delivery                                       |
| `privacy.delete.execute`       | Privacy reviewer/checker            | Retention/legal-hold evaluation; irreversible-action approval                       |
| `role.assign_privileged`       | Security admin/checker              | Request/ticket, time scope, SoD, access review                                      |
| `break_glass.activate`         | Super admin                         | Hardware/strong MFA, incident ID, time limit, real-time alert, retrospective review |

## Seller organization permissions

| Capability                                   |                         Owner |             Organization manager |               Operator |
| -------------------------------------------- | ----------------------------: | -------------------------------: | ---------------------: |
| Accept seller agreement/change legal profile |                           Yes |                     Request only |                     No |
| Manage team and roles                        |                           Yes | If delegated, cannot grant owner |                     No |
| Change settlement account                    |              Yes with step-up |                    No by default |                     No |
| View ledger/settlements                      |                           Yes |                Configurable read |          No by default |
| Create/edit offers and promotions            |                           Yes |                              Yes |             If granted |
| Adjust inventory                             |                           Yes |                              Yes | If granted with limits |
| Fulfill orders/print documents               |                           Yes |                              Yes |        Yes if assigned |
| Submit return/finance disputes               |                           Yes |                              Yes |  Draft only if granted |
| View verification documents                  | Yes, masked as policy permits |                          Limited |                     No |

## Data classification and field controls

| Class                 | Examples                                                   | Default handling                                                  |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Public                | Published product, brand, seller storefront                | CDN/cache allowed; integrity protected                            |
| Internal              | Operational status, non-sensitive metrics                  | Authenticated; least privilege                                    |
| Confidential          | Addresses, phone/email, seller documents, support evidence | Field masking, encryption, access log, export controls            |
| Restricted financial  | Bank details, payout records, provider reconciliation      | Strong encryption, step-up, SoD, tightly scoped logs              |
| Authentication secret | Password hash, OTP secret, recovery code, token            | Never display; hash/encrypt as appropriate; strict service access |
| Prohibited            | CVV, PIN, full sensitive authentication data               | Never collect/store/log                                           |

## Access lifecycle

1. Request identifies role, scope, purpose, manager/data-owner approval, start/end date.
2. Provision through identity/RBAC service; privileged access requires MFA and notification.
3. Quarterly minimum access review; higher cadence for finance/security/super-admin.
4. Immediate revocation on termination/suspension; session/token invalidation and audit.
5. Temporary access expires automatically; dormant accounts are locked by policy.
6. Service accounts rotate credentials and are reviewed against observed use.

## Audit requirements

Every privileged create/update/approve/export/impersonation-like support access records actor, effective roles, scope, action, entity, entity version, reason/ticket, IP/device where appropriate, correlation ID, safe before/after diff, timestamp, and outcome. Audit storage is append-only/tamper-evident; secrets and unnecessary PII are redacted.
