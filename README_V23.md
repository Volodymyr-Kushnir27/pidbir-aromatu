# V23 Brand + Photo Fix

## Fixes
- Armani query cannot return Christian Dior because known brand queries are filtered by brand in `name`.
- Jo Malone aliases: `джо ма лонг`, `джо малон`, `jo malone`.
- Zielinski aliases: `зелінскі`, `зелински`, `Zielinski`.
- Escada alias support.
- DB photo updater for 155A, 61A, 208A.

## Local install
```bash
unzip ~/Downloads/pidbir-aromatu-v23-brand-photo-final.zip -d .

CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandPhotoV23.js
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/updatePhotoUrlsV23.js
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandPhotoV23.js
```

## Render
```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/updatePhotoUrlsV23.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandPhotoV23.js
```

Then restart Render service.

## Verify in SQLite
```bash
sqlite3 /var/data/perfumes.sqlite "SELECT id, number_code, name, photo FROM perfumes WHERE number_code IN ('155A','61A','208A');"
```
