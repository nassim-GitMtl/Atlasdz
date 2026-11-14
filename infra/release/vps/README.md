# Deploying Atlas DZ on a single VPS

One Linux server runs everything with Docker Compose: PostgreSQL (TLS, separate owner/runtime
roles), the API, both web apps, Caddy (automatic HTTPS from Let's Encrypt) and nightly backups.

```
Internet ──443──▶ Caddy ──▶ customer-web ─┐
                       └──▶ seller-center ─┴─▶ api ──TLS──▶ postgres ◀── backup
```

Only ports 80/443 are public. The database is reachable only inside Docker networks; of the API,
only the paths used by the Android app are forwarded on the shop domain: customer
(`/api/v1/catalog`, `auth`, `account`, `cart`, `checkout`, `orders`, `reviews`, …) and seller
(`/api/v1/seller/*`, seller sessions with an authenticator code). Staff and local API paths stay
internal. Request bodies are limited to 2 MB, except product photo uploads (7 MB).

## 1. Server prerequisites

- Ubuntu 24.04 / Debian 12, 2 vCPU, 4 GB RAM, 40 GB SSD minimum (ARM64 or AMD64).
- Docker Engine with the Compose plugin, `openssl`, `git`.
- DNS `A`/`AAAA` records for both domains pointing at the server, e.g. `atlas.dz`,
  `www.atlas.dz` and `vendeur.atlas.dz`.
- Firewall: allow 22 (restrict to your IP), 80 and 443 only.

## 2. Prepare secrets (once)

```sh
git clone <repository> /opt/atlas-src && cd /opt/atlas-src
sudo SHOP_DOMAIN=atlas.dz SELLER_DOMAIN=vendeur.atlas.dz ACME_EMAIL=ops@atlas.dz \
  bash infra/release/vps/setup.sh
```

This creates `/opt/atlas/` with random database passwords, server-action keys, the identity key
(encrypts sellers' authenticator secrets), a private CA for PostgreSQL TLS and `atlas.env`.
**Copy `/opt/atlas/secrets` to an offline, encrypted location.** Losing `identity-key` forces
every seller and staff member to re-enroll their authenticator app.

Email (password reset links, seller approval and new-order notices): put an SMTP URL in
`/opt/atlas/secrets/smtp-url`, e.g. `smtps://user:password@smtp-relay.brevo.com:465`, and set
`MAIL_FROM` in `atlas.env`. Use a sender domain with SPF and DKIM configured. Without it, the
site works but no emails are sent (logged as `MAIL_NOT_CONFIGURED`).

## 3. Build, migrate, start

```sh
cd /opt/atlas-src/infra/release
alias atlas='docker compose --env-file /opt/atlas/atlas.env -f compose.yml -f vps/compose.vps.yml'
atlas --profile operations build
atlas up -d postgres
atlas --profile operations run --rm migrate      # prints applied versions + checksumsVerified
atlas up -d
atlas ps                                         # all services healthy
```

Create the first staff account (password read from stdin, never from the command line):

```sh
read -rs PW && printf '%s' "$PW" | atlas run --rm -T api node start-release.mjs create-staff ops@atlas.dz
```

Sign in at `https://vendeur.atlas.dz/login`; the first sign-in shows the authenticator key.
Staff approve sellers under **Demandes vendeurs**, products and offers under moderation.

## 4. Go-live switch

Real cash-on-delivery orders are **off** until you set `ATLAS_LIVE_CHECKOUT=true` in
`atlas.env` and run `atlas up -d`. Before that, complete the owner checklist in the main
[release README](../README.md#go-live-checklist).

## 5. Operations

| Task          | Command                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Logs          | `atlas logs -f api`                                                                                          |
| Update        | `git pull && atlas --profile operations build && atlas --profile operations run --rm migrate && atlas up -d` |
| Backups       | `/opt/atlas/backups/atlas-*.dump` (database) and `media-*.tar.gz` (photos), daily, 14 days                   |
| Off-site copy | e.g. nightly `rclone copy /opt/atlas/backups remote:atlas-backups`                                           |
| Proxy config  | after editing `vps/Caddyfile`, run `atlas restart caddy` (a reload alone can keep reading the old file)      |

### Monitoring

Install the monitor once (checks HTTPS, containers, database readiness, disk, backup age and API
error spikes every 5 minutes; emails `ALERT_EMAIL` through `secrets/smtp-url`, at most hourly):

```sh
( crontab -l 2>/dev/null; echo '*/5 * * * * /opt/atlas-src/infra/release/vps/monitor.sh >> /var/log/atlas-monitor.log 2>&1' ) | crontab -
```

Add an external uptime check too (e.g. a free UptimeRobot or Better Stack monitor on both
domains), so you are alerted even if the whole server is down.

### Restore (test this before launch, then quarterly)

```sh
atlas stop api customer-web seller-center
docker cp /opt/atlas/backups/atlas-<stamp>.dump atlas-release-postgres-1:/tmp/r.dump
docker exec -it atlas-release-postgres-1 sh -c \
  'dropdb -U atlas_owner atlas && createdb -U atlas_owner atlas && pg_restore -U atlas_owner -d atlas /tmp/r.dump'
docker run --rm -v atlas-release_media_data:/photos -v /opt/atlas/backups:/b alpine \
  sh -c 'tar -xzf /b/media-<stamp>.tar.gz -C /photos && chown -R 1000:1000 /photos'
atlas up -d
```

Re-run the `GRANT`s from `init-db.sh` after a full restore if the runtime role reports
permission errors (`ALTER DEFAULT PRIVILEGES` applies to objects created by `atlas_owner`).

### Rollback

Redeploy the previous git revision (`git checkout <tag>` then build/up). Migrations are
forward-only; if the newer release applied a migration, restore the pre-upgrade backup instead.
