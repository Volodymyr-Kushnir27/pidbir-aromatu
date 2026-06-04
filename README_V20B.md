# V20B exact-note router duplicate fix

Цей фікс прибирає дубль `handledExactNote` у `src/index.js` і залишає рівно один exact-note router перед `onUserText(ctx)`.

## Локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"
unzip ~/Downloads/pidbir-aromatu-v20b-router-duplicate-fix.zip -d .
node scripts/fixExactNoteRouterDuplicateV20b.js
node scripts/checkExactNoteRouterV20b.js
```

Локальний тест нот запускай тільки з локальним шляхом до БД:

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkExactNoteV20.js
```

Якщо локально база інша:

```bash
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite SEARCH_DEBUG=1 node scripts/checkExactNoteV20.js
```

## Render

```bash
cd /opt/render/project/src
node scripts/checkExactNoteRouterV20b.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkExactNoteV20.js
```

Після deploy зроби Manual Restart.
