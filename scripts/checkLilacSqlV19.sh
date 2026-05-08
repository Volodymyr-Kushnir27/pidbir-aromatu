#!/usr/bin/env bash
set -euo pipefail
DB="${CATALOG_DB_PATH:-/var/data/perfumes.sqlite}"
echo "DB: $DB"
for term in "Бузок" "бузок" "Сирень" "сирень" "Зелений бузок" "Полуниц" "Мараку" "Базил" "Гарбуз" "Диня" "Кавун" "Імбир"; do
  echo "---- $term ----"
  sqlite3 "$DB" "SELECT id, number_code, name, replace(notes, char(10), ' | ') AS notes FROM perfumes WHERE notes LIKE '%$term%' LIMIT 20;"
done
