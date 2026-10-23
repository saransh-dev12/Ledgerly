#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL to the database being backed up}"
: "${DRILL_DATABASE_URL:?Set DRILL_DATABASE_URL to an empty disposable database}"
[ "${DRILL_CONFIRM:-}" = "RESTORE-DRILL" ] || {
  echo "Refusing to restore. Re-run with DRILL_CONFIRM=RESTORE-DRILL."
  exit 1
}
[ "$SOURCE_DATABASE_URL" != "$DRILL_DATABASE_URL" ] || {
  echo "SOURCE_DATABASE_URL and DRILL_DATABASE_URL must be different databases."
  exit 1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
dump="$tmp_dir/restore-drill.dump"

echo "1/5 Dumping source..."
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges --file "$dump"
pg_restore --list "$dump" >/dev/null

echo "2/5 Checking the drill target is empty..."
existing="$(psql "$DRILL_DATABASE_URL" -Atc "select count(*) from pg_tables where schemaname='public'")"
[ "$existing" = "0" ] || {
  echo "Drill database is not empty ($existing tables). Use a fresh database or Neon branch."
  exit 1
}

echo "3/5 Restoring into the drill database..."
pg_restore --no-owner --no-privileges --dbname "$DRILL_DATABASE_URL" "$dump"

echo "4/5 Comparing row counts..."
tables="$(psql "$SOURCE_DATABASE_URL" -Atc "select tablename from pg_tables where schemaname='public' order by tablename")"
failed=0
for table in $tables; do
  source_count="$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from \"$table\"")"
  drill_count="$(psql "$DRILL_DATABASE_URL" -Atc "select count(*) from \"$table\"")"
  if [ "$source_count" != "$drill_count" ]; then
    echo "  MISMATCH $table: source=$source_count restored=$drill_count"
    failed=1
  else
    echo "  OK $table: $source_count"
  fi
done
[ "$failed" = "0" ] || { echo "Restore drill failed."; exit 1; }

echo "5/5 Checking Prisma migration history..."
source_migrations="$(psql "$SOURCE_DATABASE_URL" -Atc 'select count(*) from "_prisma_migrations" where finished_at is not null')"
drill_migrations="$(psql "$DRILL_DATABASE_URL" -Atc 'select count(*) from "_prisma_migrations" where finished_at is not null')"
[ "$source_migrations" = "$drill_migrations" ] || {
  echo "Migration history mismatch: source=$source_migrations restored=$drill_migrations"
  exit 1
}

echo "Restore drill passed: $drill_migrations migrations and every public table matched."
echo "Drop the disposable database/branch when finished; this script never drops it."
