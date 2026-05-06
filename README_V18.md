# V18 exact-note router + aliases fix

Цей пакет робить дві речі:

1. Підключає exact-note пошук у `src/index.js` перед старим AI/user flow.
2. Додає hard aliases у `src/search/exactNoteSearch.js` для проблемних нот:
   - полуниця / клубника / strawberry
   - маракуя / passion fruit
   - базилік / basil
   - гарбуз / pumpkin
   - яблуко / apple
   - груша / pear

## Локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"
unzip ~/Downloads/pidbir-aromatu-v18-router-aliases-fix.zip -d .
node scripts/applyExactNoteRouterAndAliasesV18.js
node scripts/checkExactNoteRouterAndNotesV18.js
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkExactNoteTermsV18.js
```

## Git

```bash
git add src/index.js src/flows/exactNoteTelegramFlow.js src/search/exactNoteSearch.js scripts/applyExactNoteRouterAndAliasesV18.js scripts/checkExactNoteRouterAndNotesV18.js scripts/checkExactNoteTermsV18.js scripts/checkNoteSqlV18.sh README_V18.md
git commit -m "Route exact notes before AI and add note aliases"
git push
```

## Render

```bash
cd /opt/render/project/src
node scripts/checkExactNoteRouterAndNotesV18.js
grep -R "EXACT_NOTE_ROUTER_V18\|onExactNoteText\|EXACT_NOTE_ALIASES_V18\|findExactNoteMatches" -n src/index.js src/flows/exactNoteTelegramFlow.js src/search/exactNoteSearch.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkExactNoteTermsV18.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite bash scripts/checkNoteSqlV18.sh
```

Після цього зробити Manual Restart на Render.
