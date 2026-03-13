const Database = require("better-sqlite3");

const DB_PATH =
  process.env.CATALOG_DB_PATH ||
  process.env.DB_PATH ||
  "/var/data/perfumes.sqlite";
const db = new Database(DB_PATH, { readonly: true });

console.log("DB:", DB_PATH);

const tables = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
`).all();
console.log("Tables:", tables.map(t => t.name));

const countPerf = db.prepare(`SELECT COUNT(*) AS n FROM perfumes`).get().n;
console.log("perfumes count:", countPerf);

const cols = db.prepare(`PRAGMA table_info(perfumes)`).all();
console.log("perfumes columns:", cols.map(c => c.name).join(", "));

// чи є колонки photo / number_code
const sample = db.prepare(`
  SELECT id, number_code, name, photo
  FROM perfumes
  WHERE COALESCE(number_code,'') != '' OR UPPER(name) LIKE '%77%'
  LIMIT 5
`).all();

console.log("sample:", sample);
