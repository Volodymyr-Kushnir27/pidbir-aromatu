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

const terms = ["640", "640A", "417", "417A", "626", "626A", "32", "32E", "Valentino", "Le Beau", "Symphony", "Guerlain"];

console.log(`📦 DB PATH: ${ABS_DB_PATH}`);

for (const term of terms) {
  const rows = db.prepare(`
    SELECT id, number_code, name, for_whom, type
    FROM perfumes
    WHERE number_code LIKE @like
       OR number_codes LIKE @like
       OR name LIKE @like
       OR version LIKE @like
    ORDER BY id
    LIMIT 10
  `).all({ like: `%${term}%` });

  console.log(`\n=== ${term} ===`);
  console.table(rows);
}

const exact = db.prepare(`
  SELECT id, number_code, number_codes, name, photo
  FROM perfumes
  WHERE number_code IN ('640A', '417A', '626A', '32E')
  ORDER BY id
`).all();

console.log("\n✅ Exact added rows:");
console.table(exact);

if (exact.length < 4) {
  console.error(`❌ Знайдено тільки ${exact.length}/4. Запусти addLast4PerfumesV28.js саме на тій БД, яку використовує бот.`);
  process.exit(1);
}

console.log("✅ 4/4 аромати є в БД.");
