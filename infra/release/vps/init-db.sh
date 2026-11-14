#!/bin/sh
# Runs once, on the first start of an empty PostgreSQL volume.
# atlas_owner (POSTGRES_USER) owns the schema and runs migrations.
# atlas_app is the least-privilege runtime role used by the API.
set -eu

APP_PASSWORD="$(cat "$ATLAS_APP_PASSWORD_FILE")"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_PASSWORD" <<'SQL'
CREATE ROLE atlas_app LOGIN PASSWORD :'app_password';
REVOKE ALL ON DATABASE atlas FROM PUBLIC;
GRANT CONNECT ON DATABASE atlas TO atlas_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Objects created later by migrations (as atlas_owner) are usable, not alterable, by atlas_app.
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_owner GRANT USAGE ON SCHEMAS TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_owner
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_owner GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_owner GRANT EXECUTE ON FUNCTIONS TO atlas_app;
GRANT USAGE ON SCHEMA public TO atlas_app;
SQL

# Require TLS + SCRAM for every network connection; local socket stays for maintenance.
cat > "$PGDATA/pg_hba.conf" <<'HBA'
local   all   all                 scram-sha-256
hostssl all   all   0.0.0.0/0     scram-sha-256
hostssl all   all   ::/0          scram-sha-256
HBA
