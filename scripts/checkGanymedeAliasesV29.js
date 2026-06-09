const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.CATALOG_DB_PATH || "./data/perfumes.sqlite";
const ABS_DB_PATH = path.resolve(DB_PATH);

if (!fs.existsSync(ABS_DB_PATH)) {
  console.error(`❌ DB not found: ${ABS_DB_PATH}`);
  process.exit(1);
}

const db = new Database(ABS_DB_PATH, { readonly: true });

const terms = [
  "330",
  "330A",
  "Ganymede",
  "Ганімед",
  "Ганимед",
  "Ганнимед",
  "Ганиммед",
  "Номер Ганимед"
];

console.log(`📦 DB PATH: ${ABS_DB_PATH}`);

for (const term of terms) {
  const rows = db.prepare(`
    SELECT id, number_code, name, for_whom, type
    FROM perfumes
    WHERE number_code LIKE @q
       OR number_codes LIKE @q
       OR name LIKE @q
       OR version LIKE @q
       OR keywords LIKE @q
    ORDER BY
      CASE
        WHEN number_code LIKE @q THEN 1
        WHEN name LIKE @q THEN 2
        WHEN version LIKE @q THEN 3
        WHEN keywords LIKE @q THEN 4
        ELSE 9
      END,
      id
    LIMIT 10
  `).all({ q: `%${term}%` });

  console.log(`\n=== ${term} ===`);
  console.table(rows);
}

const ganymede = db.prepare(`
  SELECT id, number_code, name, version
  FROM perfumes
  WHERE number_code = '330A'
     OR number_code = '330А'
     OR number_codes LIKE '%330%'
     OR name LIKE '%Ganymede%'
  LIMIT 1
`).get();

if (!ganymede) {
  console.error("❌ 330A / Ganymede не знайдено.");
  process.exit(1);
}

const version = String(ganymede.version || "").toLowerCase();
const required = ["ганимед", "ганнимед", "ганиммед", "номер ганимед"];

const missing = required.filter((x) => !version.includes(x));
if (missing.length) {
  console.error("❌ Не вистачає aliases:", missing);
  process.exit(1);
}

console.log("\n✅ Ganymede aliases OK.");
