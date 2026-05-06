#!/usr/bin/env bash
set -euo pipefail
DB="${CATALOG_DB_PATH:-/var/data/perfumes.sqlite}"
echo "DB: $DB"
for term in "Кавун" "Дин" "Полуниц" "Клубник" "Мараку" "Базил" "Гарбуз" "Імбир" "Вишн"; do
  echo "\n--- $term ---"
  sqlite3 "$DB" "SELECT id, number_code, name FROM perfumes WHERE notes LIKE '%$term%' OR lower(notes) LIKE lower('%$term%');"
done
