require("dotenv").config();

const db = require("../src/db/catalogDb");
const { DB_PATH } = require("../src/config");

function scalar(sql) {
  try {
    return db.prepare(sql).get();
  } catch (e) {
    return { error: e.message };
  }
}

console.log("DB_PATH:", DB_PATH);
console.log("tables:");
console.table(db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all());

console.log("perfumes count:", scalar("SELECT COUNT(*) AS count FROM perfumes"));
console.log("perfumes_fts count:", scalar("SELECT COUNT(*) AS count FROM perfumes_fts"));
console.log("sample:");
console.table(
  db.prepare("SELECT id, number_code, name FROM perfumes ORDER BY id LIMIT 5").all(),
);
