# V20 exact note aliases fix

This patch replaces the hard alias block in `src/search/exactNoteSearch.js` and ensures `src/index.js` routes exact-note queries before the old AI/profile flow.

## Apply locally

```bash
node scripts/applyExactNoteAliasesV20.js
node scripts/checkExactNoteV20.js
```

## Verify

```bash
grep -R "EXACT_NOTE_ROUTER_V20\|EXACT_NOTE_ALIASES_V20\|onExactNoteText\|findExactNoteMatches" -n src/index.js src/flows/exactNoteTelegramFlow.js src/search/exactNoteSearch.js
```

## Render

```bash
cd /opt/render/project/src
node scripts/checkExactNoteV20.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite bash scripts/checkNoteSqlV20.sh
```

Manual restart after deploy.
