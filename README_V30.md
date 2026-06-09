# V30 — Ganymede має бути першим при запиті "Номер аромата ганимед"

## Що було не так

Запит:

```txt
Номер аромата ганимед
```

потрапляв у direct search як кілька слів:

```txt
номер / аромата / ганимед
```

Слово `аромата` випадково збігалось з багатьма рядками, бо майже всі назви мають текст `(версія аромату/аромата)`. Тому бот знаходив 10 варіантів, і `330A Ganymede` не завжди був першим.

## Що виправлено

1. Додано службові stop-words:
   - номер
   - номера
   - аромата
   - ароматов
   - number

2. Додано aliases:
   - Ганімед -> ganymede
   - Ганимед -> ganymede
   - Ганнимед -> ganymede
   - Ганиммед -> ganymede
   - Номер аромата ганимед -> ganymede

3. У `buildPrefilterTerms()` додано фільтрацію noise-слів, щоб службові слова не впливали на ранжування.

## Як застосувати локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

unzip ~/Downloads/pidbir-aromatu-v30-ganymede-query-priority.zip -d .

node scripts/applyGanymedeQueryPriorityV30.js
node scripts/checkGanymedeQueryPriorityV30.js
node -c src/search/directNameKeywordSearch.js
```

Потім:

```bash
git add src/search/directNameKeywordSearch.js scripts/applyGanymedeQueryPriorityV30.js scripts/checkGanymedeQueryPriorityV30.js README_V30.md
git commit -m "Prioritize Ganymede aliases in direct search"
git push
```

## На Render

Після deploy:

```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addGanymedeAliasesV29.js
node scripts/checkGanymedeQueryPriorityV30.js
```

Потім **Manual Restart**.

## Перевір у боті

```txt
Ганнимед
Ганимед
Номер аромата ганимед
Номер Ганимед
```

У всіх цих випадках першим має бути:

```txt
330А Marc-Antoine Barrois "Ganymede" (версія аромату)
```
