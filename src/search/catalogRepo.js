const db = require("../db/catalogDb");
const { SEARCH } = require("../config");

let cachedTable = null;
let cachedColumns = null;

function getTables() {
  return db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type='table'
      ORDER BY name
      `,
    )
    .all()
    .map((r) => r.name);
}

function detectPerfumeTable() {
  if (cachedTable) return cachedTable;

  const tables = getTables();
  const preferred = [
    "perfumes",
    "catalog",
    "perfumes_filtered",
    "products",
  ];

  for (const name of preferred) {
    if (tables.includes(name)) {
      cachedTable = name;
      return cachedTable;
    }
  }

  cachedTable = tables[0] || null;
  return cachedTable;
}

function getColumns(tableName) {
  if (cachedColumns && cachedColumns.tableName === tableName) {
    return cachedColumns.cols;
  }

  const cols = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((r) => r.name);

  cachedColumns = { tableName, cols };
  return cols;
}

function pickColumn(cols, variants, fallback = null) {
  for (const v of variants) {
    if (cols.includes(v)) return v;
  }
  return fallback;
}

function getColumnMap() {
  const table = detectPerfumeTable();
  if (!table) throw new Error("No tables found in SQLite database");

  const cols = getColumns(table);

  return {
    table,
    id: pickColumn(cols, ["id", "perfume_id", "product_id"], cols[0]),
    name: pickColumn(cols, ["name", "title", "perfume_name"], null),
    brand: pickColumn(cols, ["brand", "manufacturer"], null),
    gender: pickColumn(cols, ["gender", "for_gender", "sex"], null),
    season: pickColumn(cols, ["season", "seasons"], null),
    category: pickColumn(cols, ["category", "categories", "type"], null),
    notes: pickColumn(cols, ["notes", "note", "main_notes"], null),
    accords: pickColumn(cols, ["accords", "keywords", "tags"], null),
    short_desc: pickColumn(cols, ["short_desc", "short_description", "summary"], null),
    description: pickColumn(cols, ["description", "desc", "full_description"], null),
    image_url: pickColumn(cols, ["image_url", "photo", "image", "img"], null),
    version: pickColumn(cols, ["version"], null),
    keywords: pickColumn(cols, ["keywords", "tags"], null),
  };
}

function buildSelectSql(map, limit = SEARCH.MAX_ROWS_SCAN || 600) {
  const fields = [];

  for (const [key, col] of Object.entries(map)) {
    if (key === "table") continue;
    if (col) {
      fields.push(`${col} AS ${key}`);
    } else {
      fields.push(`NULL AS ${key}`);
    }
  }

  return `
    SELECT ${fields.join(", ")}
    FROM ${map.table}
    LIMIT ${Number(limit)}
  `;
}

function getAllPerfumes(limit = SEARCH.MAX_ROWS_SCAN || 600) {
  const map = getColumnMap();
  const sql = buildSelectSql(map, limit);
  return db.prepare(sql).all();
}

function getPerfumeById(id) {
  const map = getColumnMap();

  if (!map.id) return null;

  const fields = [];
  for (const [key, col] of Object.entries(map)) {
    if (key === "table") continue;
    if (col) fields.push(`${col} AS ${key}`);
    else fields.push(`NULL AS ${key}`);
  }

  const sql = `
    SELECT ${fields.join(", ")}
    FROM ${map.table}
    WHERE ${map.id} = ?
    LIMIT 1
  `;

  return db.prepare(sql).get(id) || null;
}

function findByNameLike(text, limit = 20) {
  const map = getColumnMap();
  if (!map.name) return [];

  const fields = [];
  for (const [key, col] of Object.entries(map)) {
    if (key === "table") continue;
    if (col) fields.push(`${col} AS ${key}`);
    else fields.push(`NULL AS ${key}`);
  }

  const sql = `
    SELECT ${fields.join(", ")}
    FROM ${map.table}
    WHERE LOWER(${map.name}) LIKE LOWER(?)
    LIMIT ?
  `;

  return db.prepare(sql).all(`%${String(text || "").trim()}%`, Number(limit));
}

module.exports = {
  getAllPerfumes,
  getPerfumeById,
  findByNameLike,
  getColumnMap,
};