#!/usr/bin/env bash
# Host-side monitoring for the single-VPS deployment. Run every 5 minutes from root's crontab:
#   */5 * * * * /opt/atlas-src/infra/release/vps/monitor.sh >> /var/log/atlas-monitor.log 2>&1
# Alerts are emailed with the same SMTP URL as the application (secrets/smtp-url), to
# ALERT_EMAIL from atlas.env. Repeated alerts for the same problem are sent at most hourly.
set -uo pipefail

ATLAS_HOME="${ATLAS_HOME:-/opt/atlas}"
# atlas.env is a Docker Compose env file, not shell syntax (MAIL_FROM contains "<"), so the
# few values needed here are parsed instead of sourced.
env_value() {
  sed -n "s/^$1=//p" "$ATLAS_HOME/atlas.env" | tail -n 1 | sed -E "s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}
SHOP_DOMAIN="$(env_value SHOP_DOMAIN)"
SELLER_DOMAIN="$(env_value SELLER_DOMAIN)"
ALERT_EMAIL="$(env_value ALERT_EMAIL)"
MAIL_FROM="$(env_value MAIL_FROM)"
if [ -z "$SHOP_DOMAIN" ] || [ -z "$SELLER_DOMAIN" ]; then
  echo "$(date -u +%FT%TZ) PROBLEM: cannot read SHOP_DOMAIN/SELLER_DOMAIN from $ATLAS_HOME/atlas.env"
  exit 2
fi
STATE_DIR="$ATLAS_HOME/monitor"
mkdir -p "$STATE_DIR"
problems=()

check_url() { # name url
  local code
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$2" || echo 000)"
  [ "$code" = 200 ] || problems+=("$1 returned HTTP $code ($2)")
}
check_url "Shop" "https://$SHOP_DOMAIN/"
check_url "Seller Center" "https://$SELLER_DOMAIN/login"

# Containers: every service must be running, and healthy where a healthcheck exists.
while read -r name state health; do
  [ "$state" = running ] || problems+=("container $name is $state")
  [ -z "$health" ] || [ "$health" = healthy ] || problems+=("container $name is $health")
done < <(docker ps -a --filter label=com.docker.compose.project=atlas-release \
  --format '{{.Names}} {{.State}} {{if .Status}}{{.Status}}{{end}}' \
  | awk '{h=""; if (match($0,/\((healthy|unhealthy|health: starting)\)/)) h=substr($0,RSTART+1,RLENGTH-2); print $1, $2, h}' \
  | grep -v 'migrate-run')

# API readiness (database reachable) from inside the API container.
docker exec atlas-release-api-1 node -e \
  "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
  || problems+=("API readiness check failed (database unreachable?)")

# Order emails (new order, status, reminders) that failed or have waited over 30 minutes.
stuck="$(docker exec atlas-release-postgres-1 psql -U atlas_owner -d atlas -tAc \
  "SELECT count(*) FROM platform.outbox_events WHERE delivery_state = 'FAILED' OR (delivery_state = 'PENDING' AND occurred_at < now() - interval '30 minutes')" \
  2>/dev/null | tr -d '[:space:]')"
[ "${stuck:-0}" = 0 ] || problems+=("$stuck order email(s) failed or stuck in the outbox")

# Disk space.
used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
[ "${used:-0}" -lt 85 ] || problems+=("root disk ${used}% full")

# Backups: newest database dump must be younger than 26 hours.
latest="$(find "$ATLAS_HOME/backups" -name 'atlas-*.dump' -mmin -1560 | head -1)"
[ -n "$latest" ] || problems+=("no database backup in the last 26 hours")

# Error spike: more than 20 error-level API log lines in 5 minutes.
errors="$(docker logs --since 5m atlas-release-api-1 2>&1 | grep -c '"level":50' || true)"
[ "${errors:-0}" -le 20 ] || problems+=("API logged $errors errors in 5 minutes")

stamp="$(date -u +%FT%TZ)"
if [ ${#problems[@]} -eq 0 ]; then
  [ -f "$STATE_DIR/alerting" ] && rm -f "$STATE_DIR/alerting" && echo "$stamp recovered"
  exit 0
fi
for problem in "${problems[@]}"; do echo "$stamp PROBLEM: $problem"; done

# Throttle: one email per hour while problems persist.
if [ -f "$STATE_DIR/alerting" ] && [ -n "$(find "$STATE_DIR/alerting" -mmin -60)" ]; then exit 1; fi
touch "$STATE_DIR/alerting"
smtp="$(cat "$ATLAS_HOME/secrets/smtp-url" 2>/dev/null)"
if [ -z "$smtp" ] || [ -z "${ALERT_EMAIL:-}" ]; then
  echo "$stamp alert not emailed: set ALERT_EMAIL in atlas.env and secrets/smtp-url"
  exit 1
fi
from="$(sed -E 's/.*<([^>]+)>.*/\1/' <<<"${MAIL_FROM:-no-reply@$SHOP_DOMAIN}")"
creds="$(sed -E 's#^smtps?://([^@]+)@.*#\1#' <<<"$smtp")"
host="$(sed -E 's#^(smtps?)://[^@]+@#\1://#' <<<"$smtp")"
{
  printf 'From: %s\nTo: %s\nSubject: [Atlas DZ] %d problem(s) on %s\n\n' \
    "$from" "$ALERT_EMAIL" "${#problems[@]}" "$(hostname)"
  printf -- '- %s\n' "${problems[@]}"
} | curl -s --ssl-reqd --url "$host" --user "$(printf '%b' "${creds//%/\\x}")" \
  --mail-from "$from" --mail-rcpt "$ALERT_EMAIL" --upload-file - \
  || echo "$stamp alert email failed"
exit 1
