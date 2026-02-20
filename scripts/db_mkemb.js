require("dotenv").config();
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || "./data/perfumes_filtered.sqlite";
const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS perfume_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perfume_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(perfume_id, model)
);

CREATE INDEX IF NOT EXISTS idx_perfume_embeddings_model
ON perfume_embeddings(model);

CREATE INDEX IF NOT EXISTS idx_perfume_embeddings_perfume_model
ON perfume_embeddings(perfume_id, model);
`);

console.log("✅ OK: perfume_embeddings table created in:", DB_PATH);
db.close();
