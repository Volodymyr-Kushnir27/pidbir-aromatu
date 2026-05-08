# V19 — exact-note router + lilac/syringa aliases

Fixes cases where requests like `бузок`, `сирень`, `полуниця`, `маракуя`, `базилік`, `гарбуз` were routed into AI/style search instead of exact `notes` search.

## Install

```bash
unzip ~/Downloads/pidbir-aromatu-v19-lilac-exact-note-fix.zip -d .
node scripts/applyLilacExactNoteRouterV19.js
node scripts/checkLilacExactNoteRouterV19.js
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkLilacExactNoteTermsV19.js
```

## Render

```bash
cd /opt/render/project/src
node scripts/checkLilacExactNoteRouterV19.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkLilacExactNoteTermsV19.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite bash scripts/checkLilacSqlV19.sh
```

Then Manual Restart.
