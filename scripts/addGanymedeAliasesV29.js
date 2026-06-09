const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.CATALOG_DB_PATH || "./data/perfumes.sqlite";
const ABS_DB_PATH = path.resolve(DB_PATH);

if (!fs.existsSync(ABS_DB_PATH)) {
  console.error(`❌ DB not found: ${ABS_DB_PATH}`);
  console.error("Приклад:");
  console.error("  CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addGanymedeAliasesV29.js");
  process.exit(1);
}

const db = new Database(ABS_DB_PATH);
db.pragma("journal_mode = WAL");

const backupPath = `${ABS_DB_PATH}.bak_v29_ganymede_aliases_${Date.now()}`;
fs.copyFileSync(ABS_DB_PATH, backupPath);

const aliases = [
  "Ганімед",
  "Ганимед",
  "Ганнимед",
  "Ганиммед",
  "Номер Ганимед",
  "Номер Ганімед",
  "Номер Ганнимед",
  "Номер Ганиммед",
  "Ганімед номер",
  "Ганимед номер",
  "Ganymede",
  "Marc-Antoine Barrois Ganymede",
  "Marc Antoine Barrois Ganymede",
  "Марс Антуан Барруа Ганімед",
  "Марк Антуан Барруа Ганімед"
];

function appendUniqueText(current, items) {
  const existing = String(current || "")
    .split(/\r?\n|,|;/)
    .map((x) => x.trim())
    .filter(Boolean);

  const normalized = new Set(existing.map((x) => x.toLowerCase()));

  for (const item of items) {
    const key = item.toLowerCase();
    if (!normalized.has(key)) {
      existing.push(item);
      normalized.add(key);
    }
  }

  return existing.join("\n");
}

const row = db.prepare(`
  SELECT id, number_code, name, keywords, version
  FROM perfumes
  WHERE number_code = '330A'
     OR number_code = '330А'
     OR number_codes LIKE '%330%'
     OR name LIKE '%Ganymede%'
     OR name LIKE '%Ganymed%'
  LIMIT 1
`).get();

if (!row) {
  console.error("❌ Не знайшов аромат 330A / Ganymede у таблиці perfumes.");
  process.exit(1);
}

const newVersion = appendUniqueText(row.version, aliases);
const newKeywords = appendUniqueText(row.keywords, [
  "ганімед",
  "ганимед",
  "ганнимед",
  "ганиммед",
  "ganymede"
]);

db.prepare(`
  UPDATE perfumes
  SET version = @version,
      keywords = @keywords
  WHERE id = @id
`).run({
  id: row.id,
  version: newVersion,
  keywords: newKeywords
});

function rebuildFtsIfExists() {
  const hasFts = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='perfumes_fts'
  `).get();

  if (!hasFts) {
    console.log("ℹ️ perfumes_fts не знайдено — пропускаю rebuild FTS.");
    return;
  }

  db.exec(`
    DROP TRIGGER IF EXISTS perfumes_ai_fts;
    DROP TRIGGER IF EXISTS perfumes_ad_fts;
    DROP TRIGGER IF EXISTS perfumes_au_fts;
    DROP TABLE IF EXISTS perfumes_fts;

    CREATE VIRTUAL TABLE perfumes_fts USING fts5(
      name,
      number_code,
      number_codes,
      type,
      for_whom,
      notes,
      keywords,
      description,
      version,
      season,
      occasion,
      content='perfumes',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    INSERT INTO perfumes_fts(
      rowid,
      name,
      number_code,
      number_codes,
      type,
      for_whom,
      notes,
      keywords,
      description,
      version,
      season,
      occasion
    )
    SELECT
      id,
      coalesce(name, ''),
      coalesce(number_code, ''),
      coalesce(number_codes, ''),
      coalesce(type, ''),
      coalesce(for_whom, ''),
      coalesce(notes, ''),
      coalesce(keywords, ''),
      coalesce(description, ''),
      coalesce(version, ''),
      coalesce(season, ''),
      coalesce(occasion, '')
    FROM perfumes;
  `);

  console.log("✅ perfumes_fts rebuilt");
}

rebuildFtsIfExists();

console.log(`✅ Оновлено: ${row.number_code} ${row.name}`);
console.log(`Backup: ${backupPath}`);

for (const term of ["Ганимед", "Ганнимед", "Ганиммед", "Номер Ганимед"]) {
  const found = db.prepare(`
    SELECT number_code, name
    FROM perfumes
    WHERE version LIKE @q OR keywords LIKE @q OR name LIKE @q
    LIMIT 5
  `).all({ q: `%${term}%` });
  console.log(`\n${term}:`);
  console.table(found);
}

console.log("\n✅ Done. Перезапусти бота / Render service.");
