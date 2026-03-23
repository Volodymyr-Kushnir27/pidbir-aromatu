const Database = require("better-sqlite3");
const { DB_PATH } = require("../config");

const db = new Database(DB_PATH, { readonly: true });


module.exports = db;