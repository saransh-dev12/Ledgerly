#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the Postgres connection string}"
: "${1:?Usage: scripts/restore-db.sh <backup.dump>}"
[ "${RESTORE_CONFIRM:-}" = "RESTORE" ] || { echo "Refusing to overwrite. Re-run with RESTORE_CONFIRM=RESTORE."; exit 1; }
pg_restore "$1" --dbname "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges
echo "Restore complete. Run npm run db:migrate if the schema version differs."
