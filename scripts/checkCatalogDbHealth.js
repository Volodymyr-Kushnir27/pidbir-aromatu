require("dotenv").config();

const db = require("../src/db/catalogDb");
const { DB_PATH } = require("../src/config");

console.log("DB_PATH:", DB_PATH);

const tables = db.prepare(`
  SELECT name, type
  FROM sqlite_master
  WHERE type IN ('table', 'view')
  ORDER BY name
`).all();

console.log("tables:");
console.table(tables);

try {
  console.log("perfumes count:", db.prepare("SELECT COUNT(*) AS count FROM perfumes").get());
} catch (e) {
  console.error("NO perfumes table:", e.message);
}

try {
  console.log("perfumes_fts count:", db.prepare("SELECT COUNT(*) AS count FROM perfumes_fts").get());
} catch (e) {
  console.error("NO perfumes_fts table:", e.message);
}

try {
  console.log("sample:");
  console.table(
    db.prepare("SELECT id, number_code, name FROM perfumes ORDER BY id LIMIT 5").all()
  );
} catch {}
