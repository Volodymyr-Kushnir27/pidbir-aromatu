DROP TRIGGER IF EXISTS perfumes_ai_fts;
DROP TRIGGER IF EXISTS perfumes_ad_fts;
DROP TRIGGER IF EXISTS perfumes_au_fts;
DROP TABLE IF EXISTS perfumes_fts;

CREATE VIRTUAL TABLE perfumes_fts USING fts5(
  name,
  number_code,
  number_codes,
  type,
  for_whom,
  notes,
  keywords,
  description,
  version,
  season,
  occasion,
  content='perfumes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

INSERT INTO perfumes_fts(
  rowid,
  name,
  number_code,
  number_codes,
  type,
  for_whom,
  notes,
  keywords,
  description,
  version,
  season,
  occasion
)
SELECT
  id,
  coalesce(name, ''),
  coalesce(number_code, ''),
  coalesce(number_codes, ''),
  coalesce(type, ''),
  coalesce(for_whom, ''),
  coalesce(notes, ''),
  coalesce(keywords, ''),
  coalesce(description, ''),
  coalesce(version, ''),
  coalesce(season, ''),
  coalesce(occasion, '')
FROM perfumes;

CREATE TRIGGER perfumes_ai_fts AFTER INSERT ON perfumes BEGIN
  INSERT INTO perfumes_fts(
    rowid,
    name,
    number_code,
    number_codes,
    type,
    for_whom,
    notes,
    keywords,
    description,
    version,
    season,
    occasion
  )
  VALUES (
    new.id,
    coalesce(new.name, ''),
    coalesce(new.number_code, ''),
    coalesce(new.number_codes, ''),
    coalesce(new.type, ''),
    coalesce(new.for_whom, ''),
    coalesce(new.notes, ''),
    coalesce(new.keywords, ''),
    coalesce(new.description, ''),
    coalesce(new.version, ''),
    coalesce(new.season, ''),
    coalesce(new.occasion, '')
  );
END;

CREATE TRIGGER perfumes_ad_fts AFTER DELETE ON perfumes BEGIN
  INSERT INTO perfumes_fts(
    perfumes_fts,
    rowid,
    name,
    number_code,
    number_codes,
    type,
    for_whom,
    notes,
    keywords,
    description,
    version,
    season,
    occasion
  )
  VALUES (
    'delete',
    old.id,
    coalesce(old.name, ''),
    coalesce(old.number_code, ''),
    coalesce(old.number_codes, ''),
    coalesce(old.type, ''),
    coalesce(old.for_whom, ''),
    coalesce(old.notes, ''),
    coalesce(old.keywords, ''),
    coalesce(old.description, ''),
    coalesce(old.version, ''),
    coalesce(old.season, ''),
    coalesce(old.occasion, '')
  );
END;

CREATE TRIGGER perfumes_au_fts AFTER UPDATE ON perfumes BEGIN
  INSERT INTO perfumes_fts(
    perfumes_fts,
    rowid,
    name,
    number_code,
    number_codes,
    type,
    for_whom,
    notes,
    keywords,
    description,
    version,
    season,
    occasion
  )
  VALUES (
    'delete',
    old.id,
    coalesce(old.name, ''),
    coalesce(old.number_code, ''),
    coalesce(old.number_codes, ''),
    coalesce(old.type, ''),
    coalesce(old.for_whom, ''),
    coalesce(old.notes, ''),
    coalesce(old.keywords, ''),
    coalesce(old.description, ''),
    coalesce(old.version, ''),
    coalesce(old.season, ''),
    coalesce(old.occasion, '')
  );

  INSERT INTO perfumes_fts(
    rowid,
    name,
    number_code,
    number_codes,
    type,
    for_whom,
    notes,
    keywords,
    description,
    version,
    season,
    occasion
  )
  VALUES (
    new.id,
    coalesce(new.name, ''),
    coalesce(new.number_code, ''),
    coalesce(new.number_codes, ''),
    coalesce(new.type, ''),
    coalesce(new.for_whom, ''),
    coalesce(new.notes, ''),
    coalesce(new.keywords, ''),
    coalesce(new.description, ''),
    coalesce(new.version, ''),
    coalesce(new.season, ''),
    coalesce(new.occasion, '')
  );
END;

CREATE INDEX IF NOT EXISTS idx_perfumes_number_code ON perfumes(number_code);
CREATE INDEX IF NOT EXISTS idx_perfumes_name ON perfumes(name);
CREATE INDEX IF NOT EXISTS idx_perfumes_version ON perfumes(version);
CREATE INDEX IF NOT EXISTS idx_perfumes_for_whom ON perfumes(for_whom);
CREATE INDEX IF NOT EXISTS idx_perfumes_type ON perfumes(type);

PRAGMA optimize;
