#!/usr/bin/env bash
# One-time VPS preparation: generates every secret, the PostgreSQL TLS chain and atlas.env.
# Usage (as root, on the VPS):
#   SHOP_DOMAIN=atlas.dz SELLER_DOMAIN=vendeur.atlas.dz ACME_EMAIL=ops@atlas.dz \
#     bash infra/release/vps/setup.sh
# Re-running never overwrites existing secrets.
set -euo pipefail

: "${SHOP_DOMAIN:?Set SHOP_DOMAIN (e.g. atlas.dz)}"
: "${SELLER_DOMAIN:?Set SELLER_DOMAIN (e.g. vendeur.atlas.dz)}"
: "${ACME_EMAIL:?Set ACME_EMAIL for certificate notices}"
ATLAS_HOME="${ATLAS_HOME:-/opt/atlas}"
APP_UID=1000      # release images run as node (1000)
PG_UID=70         # postgres user in postgres:*-alpine

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
umask 077
mkdir -p "$ATLAS_HOME"/{secrets,certs/postgres,backups}

secret() { # secret <file> <generator...>
  local file="$ATLAS_HOME/secrets/$1"; shift
  [ -s "$file" ] || "$@" > "$file"
}
random_password() { openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40; }
random_key() { openssl rand -base64 32 | tr -d '\n'; }

secret postgres-owner-password random_password
secret postgres-app-password random_password
secret customer-action-key random_key
secret seller-action-key random_key
secret identity-key random_key
[ -e "$ATLAS_HOME/secrets/smtp-url" ] || : > "$ATLAS_HOME/secrets/smtp-url"   # fill in later
[ -e "$ATLAS_HOME/secrets/sms-token" ] || : > "$ATLAS_HOME/secrets/sms-token"   # optional
OWNER_PW="$(cat "$ATLAS_HOME/secrets/postgres-owner-password")"
APP_PW="$(cat "$ATLAS_HOME/secrets/postgres-app-password")"
secret database-url printf 'postgresql://atlas_app:%s@postgres:5432/atlas' "$APP_PW"
secret migration-database-url printf 'postgresql://atlas_owner:%s@postgres:5432/atlas' "$OWNER_PW"

# Private CA + server certificate for in-host PostgreSQL TLS (hostname "postgres").
CERTS="$ATLAS_HOME/certs/postgres"
if [ ! -s "$CERTS/server.crt" ]; then
  openssl req -new -x509 -days 3650 -nodes -subj "/CN=Atlas DZ database CA" \
    -keyout "$ATLAS_HOME/secrets/database-ca.key" -out "$CERTS/ca.crt"
  openssl req -new -nodes -subj "/CN=postgres" -keyout "$CERTS/server.key" -out "$CERTS/server.csr"
  printf 'subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n' > "$CERTS/server.ext"
  openssl x509 -req -in "$CERTS/server.csr" -CA "$CERTS/ca.crt" \
    -CAkey "$ATLAS_HOME/secrets/database-ca.key" -CAcreateserial -days 825 \
    -extfile "$CERTS/server.ext" -out "$CERTS/server.crt"
  rm -f "$CERTS/server.csr" "$CERTS/server.ext"
fi

# Ownership: app containers run as 1000; PostgreSQL reads its own secrets/key as 70.
chown "$APP_UID:$APP_UID" "$ATLAS_HOME"/secrets/{database-url,migration-database-url,customer-action-key,seller-action-key,identity-key,smtp-url,sms-token}
chown "$PG_UID:$PG_UID" "$ATLAS_HOME"/secrets/postgres-{owner,app}-password "$CERTS/server.key" "$CERTS/server.crt"
chmod 400 "$ATLAS_HOME"/secrets/* "$CERTS/server.key"
chmod 444 "$CERTS/ca.crt" "$CERTS/server.crt"
chmod 755 "$ATLAS_HOME" "$ATLAS_HOME/certs" "$CERTS"
chmod 700 "$ATLAS_HOME/secrets" "$ATLAS_HOME/backups"
chmod 711 "$ATLAS_HOME/secrets"   # traverse only; files stay private to their owners

ENV_FILE="$ATLAS_HOME/atlas.env"
if [ ! -s "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV
APP_ENV=production
ATLAS_HOME=$ATLAS_HOME
SHOP_DOMAIN=$SHOP_DOMAIN
SELLER_DOMAIN=$SELLER_DOMAIN
ACME_EMAIL=$ACME_EMAIL
CUSTOMER_WEB_ORIGIN=https://$SHOP_DOMAIN
SELLER_WEB_ORIGIN=https://$SELLER_DOMAIN
ATLAS_API_IMAGE=atlas-api:release
ATLAS_MIGRATE_IMAGE=atlas-migrate:release
ATLAS_CUSTOMER_IMAGE=atlas-customer:release
ATLAS_SELLER_IMAGE=atlas-seller:release
DATABASE_URL_FILE=$ATLAS_HOME/secrets/database-url
DATABASE_CA_FILE=$CERTS/ca.crt
IDENTITY_KEY_FILE=$ATLAS_HOME/secrets/identity-key
SMTP_URL_FILE=$ATLAS_HOME/secrets/smtp-url
SMS_TOKEN_FILE=$ATLAS_HOME/secrets/sms-token
# Optional SMS gateway for phone verification (empty = sellers call to confirm instead).
SMS_GATEWAY_URL=
MAIL_FROM=Atlas DZ <no-reply@$SHOP_DOMAIN>
CUSTOMER_ACTION_KEY_FILE=$ATLAS_HOME/secrets/customer-action-key
SELLER_ACTION_KEY_FILE=$ATLAS_HOME/secrets/seller-action-key
# Company facts shown on the legal pages (required before live checkout).
ATLAS_LEGAL_NAME=
ATLAS_LEGAL_ADDRESS=
ATLAS_LEGAL_RC=
ATLAS_LEGAL_NIF=
ATLAS_LEGAL_EMAIL=
ATLAS_LEGAL_PHONE=
ATLAS_LEGAL_HOST=
# Set to true only after Algerian counsel has reviewed the legal page templates.
ATLAS_LEGAL_REVIEWED=false
# Turn on only after legal/operations sign-off (see README "Go-live").
ATLAS_LIVE_CHECKOUT=false
BACKUP_RETENTION_DAYS=14
# Monitoring alerts (monitor.sh) are emailed here.
ALERT_EMAIL=$ACME_EMAIL
ENV
  chmod 600 "$ENV_FILE"
fi

echo "Prepared $ATLAS_HOME. Back up $ATLAS_HOME/secrets (especially identity-key) off the server."
