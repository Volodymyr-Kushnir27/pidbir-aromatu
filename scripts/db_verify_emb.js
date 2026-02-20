require("dotenv").config();
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || "./data/perfumes_filtered.sqlite";
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

const db = new Database(DB_PATH, { readonly: true });

const tables = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
`).all();
console.log("Tables:", tables.map(t => t.name));

const perfCount = db.prepare(`SELECT COUNT(*) AS n FROM perfumes`).get().n;
console.log("perfumes:", perfCount);

const emb = db.prepare(`SELECT model, COUNT(*) AS n FROM perfume_embeddings GROUP BY model`).all();
console.log("embeddings:", emb);

const sample = db.prepare(`
  SELECT perfume_id, model, LENGTH(embedding_json) AS len
  FROM perfume_embeddings
  WHERE model = ?
  LIMIT 3
`).all(EMBED_MODEL);
console.log("sample:", sample);

db.close();
