const Database = require("better-sqlite3");
const { DB_PATH } = require("../config");

console.log("📦 DB PATH:", DB_PATH);

const db = new Database(DB_PATH);

module.exports = db;