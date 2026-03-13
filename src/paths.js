const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data");

// створюємо папку якщо нема
fs.mkdirSync(DATA_DIR, { recursive: true });

const USER_DB_PATH =
  process.env.USER_DB_PATH || path.join(DATA_DIR, "users.sqlite");

const ADMIN_DB_PATH =
  process.env.ADMIN_DB_PATH || path.join(DATA_DIR, "admins.sqlite");

const CATALOG_DB_PATH =
  process.env.CATALOG_DB_PATH || path.join(DATA_DIR, "perfumes.sqlite");

module.exports = {
  DATA_DIR,
  USER_DB_PATH,
  ADMIN_DB_PATH,
  CATALOG_DB_PATH,
};