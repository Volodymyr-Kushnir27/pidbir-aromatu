# V22 — brand search + photo URL fix

## Що виправлено

1. `армані / армани / armani`
   - шукає тільки `Giorgio Armani` по назві бренду;
   - не підтягує `Christian Dior`, навіть якщо в полі `version` випадково є слово `armani`.

2. `джо ма лонг / jo malone`
   - шукає `Jo Malone`;
   - прибирає помилкові `Giorgio Armani`.

3. `зелінскі / зелински / Zielinski`
   - додані alias-и для `Zielinski & Rozen`;
   - має знайти обидва аромати, якщо вони є в БД.

4. `чоловічі шанель / шанель чоловічі`
   - direct brand search тепер враховує стать;
   - жіночі Chanel не мають проходити в чоловічий запит.

5. Фото в БД:
   - `155A Giorgio Armani "Black Code"`
   - `61A Hugo Boss "Hugo"`
   - `208A Escentric Molecules "Molecule 03"`

---

## Встановити локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

unzip ~/Downloads/pidbir-aromatu-v22-brand-photo-fix.zip -d .

node scripts/applyBrandSearchFixV22.js
```

## Перевірити локально

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV22.js
```

Якщо локальна БД називається інакше:

```bash
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV22.js
```

---

## Оновити фото в локальній БД

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/updatePhotoUrlsV22.js
```

Або через sqlite3:

```bash
sqlite3 ./data/perfumes.sqlite < scripts/updatePhotoUrlsV22.sql
```

---

## Git push

```bash
git add src/search/directNameKeywordSearch.js scripts/applyBrandSearchFixV22.js scripts/checkBrandSearchV22.js scripts/updatePhotoUrlsV22.js scripts/updatePhotoUrlsV22.sql README_V22.md
git commit -m "Fix brand direct search and update photo URLs"
git push
```

---

## Render

```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV22.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/updatePhotoUrlsV22.js
```

Після цього зроби **Manual Restart** сервісу.
