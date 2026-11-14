#!/bin/sh
# Nightly logical backup (custom format) with retention. Restore with pg_restore (see README).
set -eu

umask 077
printf 'postgres:5432:atlas:atlas_owner:%s\n' "$(cat /run/secrets/postgres_owner_password)" > /tmp/pgpass
chmod 600 /tmp/pgpass

run_backup() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="/backups/atlas-${stamp}.dump"
  if pg_dump --format=custom --no-owner --file="${target}.partial"; then
    mv "${target}.partial" "$target"
    echo "{\"backup\":\"$target\",\"status\":\"ok\"}"
  else
    rm -f "${target}.partial"
    echo '{"backup":"failed","status":"error"}' >&2
  fi
  # Product photos: full archive alongside the database dump.
  tar -czf "/backups/media-${stamp}.tar.gz" -C /photos . 2>/dev/null \
    || echo '{"backup":"media","status":"error"}' >&2
  find /backups -name 'media-*.tar.gz' -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
  find /backups -name 'atlas-*.dump' -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
}

# First backup shortly after start, then every 24 hours.
sleep 60
while true; do
  run_backup
  sleep 86400
done
