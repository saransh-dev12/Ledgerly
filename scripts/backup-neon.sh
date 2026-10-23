#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the Neon Postgres connection string}"
out_dir="${1:-backups}"
mkdir -p "$out_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$out_dir/roviel-neon-$stamp.dump"
docker run --rm -e PGURL="$DATABASE_URL" postgres:18 sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges' > "$file"
docker run --rm -v "$(cd "$out_dir" && pwd):/backups:ro" postgres:18 pg_restore --list "/backups/$(basename "$file")" >/dev/null
echo "Backup written and archive-verified: $file"
