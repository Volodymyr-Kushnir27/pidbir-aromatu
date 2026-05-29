# V25B — fix local test env

Цей пакет виправляє локальну помилку `BOT_TOKEN missing` у тестових скриптах.

## Локально

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25b.js
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/updatePhotoUrlsV25b.js
```

Якщо база інша:

```bash
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25b.js
```

## Render

На Render справжні `BOT_TOKEN` і `OPENAI_API_KEY` вже є в ENV, але скрипти V25B також безпечні.

```bash
cd /opt/render/project/src
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/updatePhotoUrlsV25b.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25b.js
```

Потім Manual Restart.
