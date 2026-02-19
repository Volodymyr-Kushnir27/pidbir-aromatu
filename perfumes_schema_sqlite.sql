PRAGMA foreign_keys = ON;

-- =========================
-- PERFUMES
-- =========================
DROP TABLE IF EXISTS perfume_embeddings;
DROP TABLE IF EXISTS perfumes;

CREATE TABLE perfumes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  photo        TEXT,   -- URL або будь-який рядок
  number_code  TEXT,   -- "№" з XLSX
  name         TEXT NOT NULL,
  premiere     TEXT,
  type         TEXT,
  for_whom     TEXT,
  season       TEXT,
  occasion     TEXT,
  age          TEXT,
  notes        TEXT,
  description  TEXT,
  projection   TEXT,
  keywords     TEXT,
  version      TEXT,
  komu         TEXT
);

-- Індекси для пошуку
CREATE INDEX idx_perfumes_name       ON perfumes(name);
CREATE INDEX idx_perfumes_type       ON perfumes(type);
CREATE INDEX idx_perfumes_for_whom   ON perfumes(for_whom);
CREATE INDEX idx_perfumes_season     ON perfumes(season);
CREATE INDEX idx_perfumes_occasion   ON perfumes(occasion);
CREATE INDEX idx_perfumes_keywords   ON perfumes(keywords);
CREATE INDEX idx_perfumes_notes      ON perfumes(notes);

-- =========================
-- EMBEDDINGS
-- =========================
CREATE TABLE perfume_embeddings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  perfume_id     INTEGER NOT NULL,
  model          TEXT NOT NULL,
  embedding_json TEXT NOT NULL,      -- зберігаємо як JSON-string
  updated_at     TEXT NOT NULL,      -- ISO string (як у твоєму коді)

  UNIQUE(perfume_id),
  FOREIGN KEY (perfume_id) REFERENCES perfumes(id) ON DELETE CASCADE
);

CREATE INDEX idx_embeddings_model ON perfume_embeddings(model);
