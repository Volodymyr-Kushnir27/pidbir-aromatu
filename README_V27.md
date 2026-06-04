# V27 — додавання 4 нових ароматів у БД

У цьому пакеті є готові файли для додавання 4 нових ароматів у SQLite-базу `perfumes.sqlite`.

## Додаються такі аромати

1. `640A Valentino "Donna Born In Roma" (версія аромату)`
2. `417A Jean Paul Gaultier "Le Beau" (версія аромату)`
3. `626A Louis Vuitton "Symphony" (версія аромату)`
4. `32E Guerlain "La Petite Robe Noire Intense" (версія аромату)`

## Що всередині

- `scripts/addNewPerfumesV27.js` — основний Node.js-скрипт, який:
  - робить backup БД,
  - якщо аромат уже є — оновлює його,
  - якщо немає — додає новий запис.
- `scripts/addNewPerfumesV27.sql` — SQL-версія цих самих змін.
- `scripts/checkNewPerfumesV27.js` — перевірка, що 4 аромати реально є в БД.

## Як встановити

Розпакуй ZIP у корінь проєкту:

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"
unzip ~/Downloads/pidbir-aromatu-v27-add-4-new-perfumes.zip -d .
```

## Як додати аромати локально

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/addNewPerfumesV27.js
```

Скрипт автоматично створить backup, наприклад:

```bash
./data/perfumes.sqlite.bak_v27_2026-05-12T12-34-56-000Z
```

## Як перевірити після додавання

```bash
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/checkNewPerfumesV27.js
```

## Як запустити на Render

```bash
cd /opt/render/project/src
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addNewPerfumesV27.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/checkNewPerfumesV27.js
```

Після цього зроби `Manual Restart` сервісу.

## Якщо захочеш через SQL

Якщо у тебе є доступ до SQLite-клієнта, можна використати файл:

- `scripts/addNewPerfumesV27.sql`

Але рекомендую саме `addNewPerfumesV27.js`, бо він безпечніший і сам робить backup.
