#!/usr/bin/env bash
set -e

echo "Current DB files:"
for db in \
/opt/render/project/src/data/perfumes_filtered1.sqlite \
/opt/render/project/src/data/catalog.db \
/opt/render/project/src/data/perfumes_filtered.sqlite \
/var/data/perfumes_filtered.sqlite \
/var/data/perfumes_backup_2026-04-30.sqlite \
/var/data/perfumes.sqlite
do
  [ -e "$db" ] && echo "$db" && ls -lh "$db" || true
done

if [ -f /var/data/perfumes_filtered.sqlite ]; then
  if ! sqlite3 /var/data/perfumes_filtered.sqlite "SELECT COUNT(*) FROM perfumes;" >/dev/null 2>&1; then
    echo "Renaming broken /var/data/perfumes_filtered.sqlite"
    mv /var/data/perfumes_filtered.sqlite "/var/data/perfumes_filtered_broken_$(date +%Y%m%d_%H%M%S).sqlite"
  fi
fi

if [ ! -f /var/data/perfumes.sqlite ]; then
  echo "Creating /var/data/perfumes.sqlite from project DB"
  cp /opt/render/project/src/data/perfumes_filtered.sqlite /var/data/perfumes.sqlite
else
  echo "Using existing /var/data/perfumes.sqlite"
fi

echo "Rebuilding FTS..."
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/rebuildPerfumesFts.js

echo "Health check..."
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/checkCatalogDbHealth.js
