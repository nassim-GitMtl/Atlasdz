# Security regression baseline

Run from `/Users/nams/Documents/Amazon`:

```bash
pnpm test:security
```

This command builds the required packages and runs six executable, uncached regression suites.
Use the synthetic local PostgreSQL configuration from the local testing guide, or a dedicated
disposable CI database through `DATABASE_URL`. Tests create randomly named databases, apply the
migrations, and remove only those databases after closing their pools. They also open ephemeral
loopback HTTP servers. Never point test configuration at a production database.

## Coverage

| Package             | Executed evidence                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                 | Route access inventory, authentication/permission/rate-limit guards, exact-origin CORS, safe errors, local-only account composition, live PostgreSQL sessions and seller/customer isolation |
| Customer Web        | Local-only identity/checkout opt-ins, trusted mutation origins, API origin validation, current-family logout and failure handling                                                           |
| Seller Center       | Local-only identity opt-ins, trusted mutation origins, API origin validation, current-family logout and failure handling                                                                    |
| Identity domain     | Authoritative principal resolution, session/actor/scope binding, MFA evidence, permission checks, internal refresh and self-session operations                                              |
| Identity PostgreSQL | Persisted session/replay topology, concurrent refresh/revocation, object isolation, idempotency and atomic audit/outbox rollback                                                            |
| Platform            | Fail-closed payment/payout configuration, safe configuration errors and recursive credential/payment-data redaction                                                                         |

The first complete run on 2026-10-21 passed **150 cases**: API 65 unit + 10 integration;
customer 8; seller 8; identity 27; identity PostgreSQL 18 unit + 10 integration; platform 4.
These cases overlap `test:unit` and `test:integration`; do not sum them as independent coverage.

The root runner checks that all six package tasks exist. Four `pnpm test:tooling` cases verify
that empty, malformed, missing and duplicate task inventory cannot pass that discovery check.
`pnpm verify` includes these tooling tests. CI runs `pnpm test:security` as a separate required
step, but no hosted CI result exists until source control and a remote are authorized/configured.
On 2026-10-21, `pnpm audit --prod --audit-level high` reported no known vulnerabilities and
`pnpm peers check` found no conflicts. Re-run these checks for each release candidate; this
point-in-time result does not certify the absence of vulnerabilities.

## Evidence limitations

Passing this suite does not establish commercial readiness or a full security assessment.
Still required:

- Executable end-to-end browser/accessibility suites and completed French/Arabic UI journeys.
- Production identity, real MFA/recovery, provider credential custody and distributed rate limiting.
- Browser-level CSRF/session-cookie and deployed TLS/CSP checks, uploads/media security and abuse testing.
- Runtime least-privilege database grants, network isolation, secret rotation and backup restoration.
- Notification retry/dead-letter delivery, operational alerts, resilience/load tests and deployment rollback.
- Current dependency/vulnerability review, an independent security assessment and release-owner approval.

Seller Center browser testing remains explicitly paused at port 3002 pending approval; this
suite does not navigate that target. In-process API tests are not a substitute for its UI evidence.
Normal production identity and checkout remain fail-closed; external payments and notifications
are not enabled by running these tests.
