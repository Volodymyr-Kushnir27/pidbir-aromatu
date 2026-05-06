#!/usr/bin/env bash
set -euo pipefail
DB="${CATALOG_DB_PATH:-/var/data/perfumes.sqlite}"
echo "DB: $DB"
for term in "Кавун" "Диня" "Імбир" "Полуниц" "Мараку" "Базил"; do
  echo "---- $term ----"
  sqlite3 "$DB" "SELECT id, number_code, name, replace(notes, char(10), ' | ') FROM perfumes WHERE notes LIKE '%$term%' OR notes LIKE '%${term,,}%';"
done
