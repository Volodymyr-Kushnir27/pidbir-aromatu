#!/usr/bin/env bash
set -euo pipefail

cd /opt/render/project/src

echo "Current DB files:"
find /opt/render/project/src/data /var/data -maxdepth 1 \( -name "*.sqlite" -o -name "*.db" \) -print -exec ls -lh {} \;

echo
if [ -f /var/data/perfumes_filtered.sqlite ]; then
  if ! sqlite3 /var/data/perfumes_filtered.sqlite "SELECT COUNT(*) FROM perfumes;" >/dev/null 2>&1; then
    echo "Renaming broken /var/data/perfumes_filtered.sqlite"
    mv /var/data/perfumes_filtered.sqlite "/var/data/perfumes_filtered_broken_$(date +%Y%m%d_%H%M%S).sqlite"
  fi
fi

if [ -f /var/data/perfumes.sqlite ]; then
  echo "Using existing /var/data/perfumes.sqlite"
else
  echo "Copying source DB to /var/data/perfumes.sqlite"
  cp /opt/render/project/src/data/perfumes_filtered.sqlite /var/data/perfumes.sqlite
fi

echo "Rebuilding FTS..."
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/rebuildPerfumesFts.js

echo "Health check..."
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/checkCatalogDbHealth.js
