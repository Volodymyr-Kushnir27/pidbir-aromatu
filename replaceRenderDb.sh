#!/usr/bin/env bash
set -euo pipefail
cd /opt/render/project/src

echo "Backup current DB..."
if [ -f /var/data/perfumes.sqlite ]; then
  cp /var/data/perfumes.sqlite "/var/data/perfumes_backup_$(date +%Y-%m-%d_%H-%M-%S).sqlite"
fi

echo "Copy new DB..."
cp ./data/perfumes.sqlite /var/data/perfumes.sqlite

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/rebuildPerfumesFts.js

echo "Check GABA..."
sqlite3 /var/data/perfumes.sqlite "SELECT id, number_code, name, version FROM perfumes WHERE lower(name) LIKE '%gaba%' OR lower(version) LIKE '%gaba%' OR lower(version) LIKE '%габа%';"

echo "Done. Restart service after this."
