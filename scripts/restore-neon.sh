#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the Neon Postgres connection string}"
: "${1:?Usage: scripts/restore-neon.sh <backup.dump>}"
[ "${RESTORE_CONFIRM:-}" = "RESTORE" ] || { echo "Refusing to overwrite. Re-run with RESTORE_CONFIRM=RESTORE."; exit 1; }
dir="$(cd "$(dirname "$1")" && pwd)"
file="$(basename "$1")"
docker run --rm -e PGURL="$DATABASE_URL" -e DUMP="/backups/$file" -v "$dir:/backups:ro" postgres:18 sh -c 'pg_restore --dbname "$PGURL" --clean --if-exists --no-owner --no-privileges "$DUMP"'
echo "Restore complete. Run npm run db:migrate if the source predates the current schema."
