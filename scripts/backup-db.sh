#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the Postgres connection string}"
out_dir="${1:-backups}"
mkdir -p "$out_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$out_dir/roviel-$stamp.dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$file"
echo "Backup written to $file"
echo "Verify with: pg_restore --list \"$file\" | head"
