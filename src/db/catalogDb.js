const Database = require("better-sqlite3");
const { DB_PATH } = require("../config");

// Runtime should be readonly
const db = new Database(DB_PATH, { readonly: true });

module.exports = db;
