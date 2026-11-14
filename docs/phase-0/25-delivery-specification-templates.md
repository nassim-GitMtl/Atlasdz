# Mandatory Feature and Screen Specification Templates

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

These templates are release gates for every implementation slice. They convert the Phase 0 architecture into traceable work and prevent a rendered screen from being mistaken for a complete feature.

## Feature specification

```md
# [FEATURE-ID] Feature name

## 1. Business requirement

Problem, business outcome, source PRD requirement, in-scope/out-of-scope behavior.

## 2. User roles

Actors, ownership scope, permission strings, segregation-of-duties constraints.

## 3. User stories

Primary story plus operational, accessibility, localization, and recovery stories.

## 4. Acceptance criteria

Given/when/then happy path, boundary cases, state transitions, Arabic RTL, French, responsive, accessibility, low-bandwidth, and operational acceptance.

## 5. UI screens

Screen IDs from the inventory and each state used.

## 6. UI components

Design-system components, variants, content rules, keyboard/screen-reader and RTL behavior.

## 7. Database changes

Entities/columns/constraints/indexes, ownership, migration, backfill, rollback, retention and PII class.

## 8. API endpoints

Method/path/version, schemas, auth, idempotency, rate limit, errors, examples and OpenAPI change.

## 9. Validation

Client guidance and authoritative server/domain validation, limits, normalization and localized messages.

## 10. Permissions

Atomic permissions, scope predicates, step-up, audit and denial behavior.

## 11. Business rules

Invariants, state graph, policy/config versions, calculations, concurrency and effective dates.

## 12. Events

Produced/consumed schema versions, transaction/outbox boundary, ordering, retry, DLQ and idempotency.

## 13. Notifications

Catalog IDs, audience, locale, channels, preference/required status, deduplication and provider fallback.

## 14. Audit requirements

Actor/action/entity/reason/before-after/correlation and redaction.

## 15. Failure scenarios

Validation, conflict, dependency timeout, duplicate, out-of-order, partial, offline and compensation behavior.

## 16. Unit tests

Business rules, calculations, state/property tests, authorization and localization functions.

## 17. Integration tests

Database constraints/locks, adapters, queues, migrations, webhooks and transaction/outbox tests.

## 18. End-to-end tests

Role-based journeys across desktop/mobile/Arabic/French, failure recovery and provider sandbox.

## 19. Security considerations

Threat cases, data class, abuse/rate limits, secrets, upload/payment/privacy controls and security-test evidence.

## 20. Monitoring

Logs, metrics, traces, business KPIs, SLO/error budget, alerts, dashboard, runbook and rollback/feature flag.

## Release metadata

Owner, reviewers, dependencies, rollout cohort, feature flag, migration order, compliance decision, documentation links and definition-of-done checklist.
```

## Screen specification

```md
# [SCREEN-ID] Page name

- Application:
- Route/deep link:
- User role and scope:
- Purpose and success outcome:
- Source journeys/features:

## Desktop layout

Information hierarchy, grid, sticky/scroll behavior, density and breakpoint changes.

## Mobile layout

Navigation, stacking, bottom actions, virtual keyboard, safe areas and low-bandwidth behavior.

## Header

Title, breadcrumbs/context, status, main action and permission behavior.

## Navigation

Entry/exit routes, back behavior, deep links, unsaved-change guard and forbidden/not-found behavior.

## Fields

Field, source of truth, type, required, default, formatting, localization, masking, autocomplete and data class.

## Components

Design-system components and exact variants.

## Buttons and actions

Label, permission, precondition, consequence, confirmation, idempotency and result.

## Validation

Field, cross-field, domain and async validation with Arabic/French messages.

## Loading state

Skeleton/progress, cancellability, timeout and retry.

## Empty state

Reason-specific message, illustration/asset, safe next action.

## Error state

Validation/conflict/network/provider/permission/not-found/maintenance handling and correlation ID.

## Success state

Confirmation, durable reference, follow-up action and notification.

## Offline state

Read cache, draft/queue policy, forbidden financial retries and reconciliation after reconnect.

## Permissions

View and action permission strings, row/entity scope, step-up and masking.

## Backend APIs

Endpoint IDs, request/response/error contracts and freshness.

## Analytics events

Event names, triggers, properties, consent class, deduplication and server confirmation.

## Accessibility

Landmarks/headings, name/role/value, focus order, keyboard, target size, contrast, live region, zoom/reflow and test plan.

## Arabic RTL behavior

Direction, logical alignment, mirrored/non-mirrored elements, bidi-isolated identifiers, font/line height and copy.

## French behavior

Long-copy wrapping, grammar/pluralization, date/money/address and content parity.

## Security/privacy

Sensitive fields, screen capture/cache/log restrictions, upload safety and session/step-up behavior.

## Test matrix

Viewport/device, locale, role, state, network profile, accessibility technology and visual-regression cases.
```

## Traceability check before implementation approval

- Feature ID maps to PRD goal, phase and accountable product owner.
- Every referenced screen ID exists in `05-screen-inventory.md`.
- Every endpoint/error/event/notification/permission ID exists in its catalog.
- Every state-changing action maps to one domain command and one state-machine edge.
- Every database write identifies owning module and transaction boundary.
- Every privileged or financial action identifies audit, step-up and segregation of duties.
- Every external provider path has timeout, retry, idempotency, reconciliation, sandbox and outage behavior.
- Every customer-facing path has Arabic RTL, French, responsive, accessibility and low-bandwidth acceptance.
