-- Postgres schema (recommended for production)
CREATE TABLE perfumes (
  id BIGINT PRIMARY KEY,
  type TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  is_recommended BOOLEAN DEFAULT FALSE,
  short_desc TEXT,
  description TEXT,
  categories TEXT,
  image_url TEXT,
  external_url TEXT
);

CREATE INDEX idx_perfumes_name ON perfumes (name);
CREATE INDEX idx_perfumes_sku ON perfumes (sku);
CREATE INDEX idx_perfumes_categories ON perfumes (categories);

-- Import CSV (run on the DB server; adjust path and delimiter if needed)
-- COPY perfumes(id,type,sku,name,is_recommended,short_desc,description,categories,image_url,external_url)
-- FROM '/absolute/path/wc-product-export-12-1-2026-1768226025390.csv'
-- WITH (FORMAT csv, HEADER true, DELIMITER ',', QUOTE '"');