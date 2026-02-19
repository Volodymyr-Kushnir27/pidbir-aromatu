-- =========================
-- PERFUMES
-- =========================
DROP TABLE IF EXISTS perfume_embeddings;
DROP TABLE IF EXISTS perfumes;

CREATE TABLE perfumes (
  id           BIGSERIAL PRIMARY KEY,
  photo        TEXT,
  number_code  TEXT,
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

-- Індекси для пошуку (ILIKE/LIKE буде працювати, але без trigram індексації не супер швидко)
CREATE INDEX idx_perfumes_name       ON perfumes (name);
CREATE INDEX idx_perfumes_type       ON perfumes (type);
CREATE INDEX idx_perfumes_for_whom   ON perfumes (for_whom);
CREATE INDEX idx_perfumes_season     ON perfumes (season);
CREATE INDEX idx_perfumes_occasion   ON perfumes (occasion);
CREATE INDEX idx_perfumes_keywords   ON perfumes (keywords);
CREATE INDEX idx_perfumes_notes      ON perfumes (notes);

-- =========================
-- EMBEDDINGS
-- =========================
CREATE TABLE perfume_embeddings (
  id             BIGSERIAL PRIMARY KEY,
  perfume_id     BIGINT NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
  model          TEXT NOT NULL,
  embedding_json JSONB NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (perfume_id)
);

CREATE INDEX idx_embeddings_model ON perfume_embeddings (model);
