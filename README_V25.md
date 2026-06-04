# V25 — фінальний фікс брендів і фото

## Замінює

- `src/search/directNameKeywordSearch.js`

## Додає

- `scripts/updatePhotoUrlsV25.js`
- `scripts/updatePhotoUrlsV25.sql`
- `scripts/checkBrandSearchV25.js`
- `scripts/cleanupOldPatchScriptsV25.sh`

## Що виправлено

1. `армані / армани / armani` шукає тільки Giorgio Armani у назві. Dior більше не має підтягуватись через поле `version` або `keywords`.
2. `джо ма лонг / джо малон / jo malone` шукає тільки Jo Malone.
3. `зелінскі / зелински / Zielinski` шукає Zielinski & Rozen.
4. `ескада / escada` шукає Escada напряму.
5. `чоловічі шанель / шанель чоловічі` фільтрує чоловічі + унісекс.
6. Фото оновлюються в активній SQLite-БД для `155A`, `61A`, `208A`.

## Локальна перевірка

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25.js
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/updatePhotoUrlsV25.js
```

Якщо локальна база має іншу назву:

```bash
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25.js
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite node scripts/updatePhotoUrlsV25.js
```

## Render

```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/updatePhotoUrlsV25.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV25.js
```

Після цього зробити Manual Restart сервісу.

## Перевірка фото напряму в БД

```bash
sqlite3 /var/data/perfumes.sqlite "
SELECT id, number_code, name, photo
FROM perfumes
WHERE UPPER(number_code) IN ('155A','155А','61A','61А','208A','208А')
ORDER BY id;
"
```

## Git

```bash
git add src/search/directNameKeywordSearch.js scripts/updatePhotoUrlsV25.js scripts/updatePhotoUrlsV25.sql scripts/checkBrandSearchV25.js scripts/cleanupOldPatchScriptsV25.sh README_V25.md
git commit -m "Fix strict brand search and update photo URLs"
git push
```

## Видалення старих тимчасових patch-скриптів

```bash
bash scripts/cleanupOldPatchScriptsV25.sh
git add -A scripts
git commit -m "Remove obsolete patch scripts"
git push
```
