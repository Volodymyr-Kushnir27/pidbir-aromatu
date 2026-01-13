-- SQLite schema generated from wc-product-export-12-1-2026-1768226025390.csv
CREATE TABLE perfumes (
  id INTEGER PRIMARY KEY,
  type TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  is_recommended INTEGER DEFAULT 0,
  short_desc TEXT,
  description TEXT,
  categories TEXT,
  image_url TEXT,
  external_url TEXT
);

CREATE INDEX idx_perfumes_name ON perfumes(name);
CREATE INDEX idx_perfumes_sku ON perfumes(sku);
CREATE INDEX idx_perfumes_categories ON perfumes(categories);