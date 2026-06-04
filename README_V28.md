# V28 — додавання останніх 4 ароматів у реальну SQLite-БД

Проблема: ці аромати не знаходяться навіть по коду, бо вони не додані у ту БД, яку використовує бот на Render.

Важливо: `git push` не змінює `/var/data/perfumes.sqlite`, бо це persistent disk Render. Скрипт треба запустити саме на БД:

```bash
/var/data/perfumes.sqlite
```

## Файли

- `scripts/addLast4PerfumesV28.js` — додає/оновлює 4 аромати, робить backup і rebuild FTS.
- `scripts/checkLast4PerfumesV28.js` — перевіряє пошук по кодах/назвах.
- `scripts/addLast4PerfumesV28.sql` — SQL-версія, якщо треба вручну.

## Як застосувати локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

unzip ~/Downloads/pidbir-aromatu-v28-add-last-4-perfumes.zip -d .

CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/addLast4PerfumesV28.js
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/checkLast4PerfumesV28.js
```

Потім:

```bash
git add scripts/addLast4PerfumesV28.js scripts/checkLast4PerfumesV28.js scripts/addLast4PerfumesV28.sql README_V28.md
git commit -m "Add last 4 perfumes to DB migration"
git push
```

## Як застосувати на Render

Після deploy зайди в Shell Render:

```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addLast4PerfumesV28.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/checkLast4PerfumesV28.js
```

Потім зроби Manual Restart.

## Що має бути після перевірки

Бот має знаходити:

- `640`, `640A`, `640А`, `Valentino`, `Donna Born In Roma`
- `417`, `417A`, `417А`, `Le Beau`, `Жан Поль`
- `626`, `626A`, `626А`, `Louis Vuitton`, `Symphony`
- `32`, `32E`, `32Е`, `Guerlain`, `La Petite Robe Noire Intense`
