const Database = require("better-sqlite3");

const DB_PATH =
  process.env.CATALOG_DB_PATH ||
  (process.env.DATA_DIR
    ? process.env.DATA_DIR + "/perfumes.sqlite"
    : "./data/perfumes.sqlite");

console.log("📦 DB PATH:", DB_PATH);

const db = new Database(DB_PATH);

module.exports = db;