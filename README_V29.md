# V29 — aliases для Ganymede / Ганімед

Додає варіанти написання для `330А Marc-Antoine Barrois "Ganymede"`:

- Ганімед
- Ганимед
- Ганнимед
- Ганиммед
- Номер Ганимед
- Номер Ганімед
- Номер Ганнимед
- Номер Ганиммед

## Локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

unzip ~/Downloads/pidbir-aromatu-v29-ganymede-aliases.zip -d .

CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/addGanymedeAliasesV29.js
CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/checkGanymedeAliasesV29.js
```

## На Render

```bash
cd /opt/render/project/src

CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addGanymedeAliasesV29.js
CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/checkGanymedeAliasesV29.js
```

Після цього зроби **Manual Restart**.

## Перевір у боті

- `Ганимед`
- `Ганнимед`
- `Ганиммед`
- `Номер аромата Ганимед`
- `330`
- `330А`
