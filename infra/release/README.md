# Atlas DZ release artifacts

Release images and Compose configuration. For a single server (PostgreSQL, HTTPS, backups
included) follow **[vps/README.md](vps/README.md)**. Email/password identity (TOTP for sellers and
staff), seller onboarding, product photos, password reset email and seller cash-on-delivery checkout
are wired. Real orders stay disabled until `ATLAS_LIVE_CHECKOUT=true`. Electronic payments,
payouts, synthetic accounts and local checkout cannot be enabled by this release entrypoint.

## Go-live checklist

Technical items are rehearsed (see vps/README.md). These remain **owner decisions** and must be
done before setting `ATLAS_LIVE_CHECKOUT=true`:

- Algerian legal: registered entity and e-commerce registration (law 18-05), legal notices,
  terms of sale/use and privacy policy reviewed by counsel and published on both sites.
- Seller agreement (seller ships and collects cash on delivery; Atlas DZ never holds goods or
  cash), returns/complaints process and support contact staffed.
- Restricted-goods policy for categories (8 starter categories are seeded and editable).
- SMTP provider with SPF/DKIM for the sender domain (`secrets/smtp-url`; the API refuses to
  start in live mode without it); test email confirmation and password reset end to end.
- Restore test from a real backup, off-site backup copy, uptime monitoring on both domains.
- First staff account created and authenticator enrolled; at least one seller onboarded with
  photos, offers and delivery rates for the wilayas it serves.

## Build and artifact checks

From the repository root, with Docker Compose v2:

```sh
docker compose --env-file infra/release/.env.example -f infra/release/compose.yml config --quiet
docker compose --env-file infra/release/.env.example -f infra/release/compose.yml --profile operations build
pnpm exec node tools/deployment/smoke-images.mjs
```

No registry push or deployment is performed. The smoke check creates disposable, network-isolated
containers without published ports or real credentials, then removes only those containers. It
checks all images for non-root execution, portable dependency links and unsafe-config rejection;
imports the migration runner; checks API/customer liveness, API database-down readiness and absence
of synthetic login. It does **not** exercise seller UI, a real database, checkout, TLS ingress,
migrations or backup/restore. Hosted CI has the same gate but has not run from this non-Git workspace.

Images use the digest-pinned Node 24.21.0 base and pinned pnpm 11.19.0 with a frozen lockfile.
The isolated API/migration packaging step pins pnpm 11.25.0 to avoid 11.19's escaping workspace
links; hoisted self-links are corrected to the packaged root. The repository/build toolchain is
unchanged. All image dependency links are checked. The upstream
[pnpm issue](https://github.com/pnpm/pnpm/issues/13618) describes this regression. Next standalone
artifacts include static/public assets. No `.env`, local data, caches or credentials enter the
build context. Package updates/base-image updates require a fresh vulnerability review and checks.

## Operator prerequisites — not yet supplied

- Approved hosting, domains, TLS reverse proxy and production identity/session integration.
- PostgreSQL with verified TLS and a trusted CA; separate runtime and migration credentials with
  reviewed least-privilege grants. Backups with a successful isolated restore and recorded RPO/RTO.
- Private secret files readable by container UID 1000, protected from other host users, outside
  the repository. Database URL must include user/password/database, with no `ssl*` URL parameters.
  `DATABASE_SSL=true` and the mounted CA enforce verification; do not disable it.
- Separate persistent 32-byte base64 server-action encryption keys for customer and seller apps;
  share each app's key across its replicas. Rotation invalidates in-flight actions. Do not put keys
  in Docker build arguments or logs.
- Tested, immutable image digests, artifact vulnerability results, release/rollback owner and
  approved external notification, seller onboarding, return/refund and support operations.

Copy `.env.example` to an ignored operator-owned file and replace the image references, HTTPS
origins and secret paths. Absolute secret paths avoid Compose relative-path ambiguity. The CA is
public material, but database URLs and action keys are secrets. Compose mounts files; it does not
provide encrypted secret storage. Use the chosen host's secret manager for actual deployment.

## Authorized staging rehearsal sequence

Only after authorization and prerequisites are supplied:

1. Verify a fresh backup and restore into an isolated database. Record the migration status and
   the previous tested image digests. Never run synthetic seeds against a release database.
2. Validate Compose with the operator environment file. Run the `migrate` service once using a
   **migration credential** file. For example, set `DATABASE_URL_FILE` for that command only, then
   use `docker compose --env-file <operator-file> -f infra/release/compose.yml --profile operations
run --rm migrate`. Success reports applied versions and checksum verification, never credentials.
   Existing migrations are immutable; do not rewrite or silently reset checksums.
3. Start `api customer-web seller-center` using the **runtime credential** file. Container health
   is liveness only. Require API `/health/ready` to return 200 with the migrated database before
   admitting any traffic; database failure must return 503. Do not use liveness as release approval.
4. Configure an approved TLS reverse proxy on this same host. Service ports bind only to loopback
   (3100/3101/3102); do not expose them directly. Preserve the expected Host/Origin; set request
   size/time limits and HSTS at the TLS edge. Do not trust client-supplied forwarding headers.
   The bundle does not install a proxy, obtain certificates, configure DNS or open firewall ports.
5. Check external TLS, cookie/CSRF boundaries, login/recovery, tenant isolation, real seller
   catalog/coverage and a non-commercial end-to-end order/support journey. Perform seller browser
   checks only after the pending explicit approval; do not work around the blocked local target.
6. Exercise restart, database outage/recovery, graceful shutdown, monitoring/alerts, backup restore
   and rollback. Record evidence before deciding whether controlled staging can advance.

Compose limits capabilities/resources, uses a read-only root filesystem and bounded logs, and gives
web apps only temporary cache storage. The internal app network has no direct egress; the API has
database egress. Future identity or notification providers will require a reviewed egress policy.
No worker/dispatcher, distributed cache, scheduler or external delivery is provisioned here.

Rollback means redeploying the previously tested digests **only when compatible with the current
schema**. No down-migration or database deletion is automated. An incompatible schema rollback
requires an approved restore plan and a maintenance window; never restore over live data casually.
