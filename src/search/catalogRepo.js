const db = require("../db/catalogDb");

const PERFUME_SELECT_COLUMNS = `
  id,
  photo,
  name,
  number_code,
  number_codes,
  type,
  for_whom,
  season,
  occasion,
  age,
  notes,
  keywords,
  version,
  description,
  quote
`;

function normalizeCode(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/А/g, "A")
    .replace(/В/g, "B")
    .replace(/С/g, "C")
    .replace(/Е/g, "E")
    .replace(/К/g, "K")
    .replace(/М/g, "M")
    .replace(/Н/g, "H")
    .replace(/О/g, "O")
    .replace(/Р/g, "P")
    .replace(/Т/g, "T")
    .replace(/Х/g, "X");
}

function normalizeName(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/["'`"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[’‘“”"«»`]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumericCode(input) {
  const code = normalizeCode(input);
  const m = code.match(/^(\d{1,4})/);
  return m ? m[1] : "";
}

function mapRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    image_url: row.photo || "",
    photo: row.photo || "",
    name: row.name || "",
    brand: "",

    number_code: row.number_code || "",
    number_codes: row.number_codes || "",

    category: row.type || "",
    gender: row.for_whom || "",
    season: row.season || "",
    occasion: row.occasion || "",
    age: row.age || "",

    notes: row.notes || "",
    accords: row.keywords || "",
    keywords: row.keywords || "",

    // ВАЖЛИВО:
    // У твоїй БД version — це поле з alias-назвами / перекладами / альтернативними назвами.
    // Тому воно має високий пріоритет у direct-пошуку.
    version: row.version || "",

    description: row.description || "",
    short_desc: row.description || "",
    quote: row.quote || "",

    sql_score: row.sql_score ?? null,
    sql_field: row.sql_field || "",
  };
}

function getAllPerfumes(limit = 1000) {
  const rows = db
    .prepare(`
      SELECT ${PERFUME_SELECT_COLUMNS}
      FROM perfumes
      LIMIT ?
    `)
    .all(Number(limit));

  return rows.map(mapRow);
}

function getPerfumeById(id) {
  const row = db
    .prepare(`
      SELECT ${PERFUME_SELECT_COLUMNS}
      FROM perfumes
      WHERE id = ?
      LIMIT 1
    `)
    .get(id);

  return mapRow(row);
}

function findByNameLike(text, limit = 20) {
  const q = `%${String(text || "").trim()}%`;

  const rows = db
    .prepare(`
      SELECT ${PERFUME_SELECT_COLUMNS}
      FROM perfumes
      WHERE LOWER(name) LIKE LOWER(?)
      LIMIT ?
    `)
    .all(q, Number(limit));

  return rows.map(mapRow);
}

function findByExactName(text) {
  const target = normalizeName(text);
  if (!target) return null;

  const rows = db
    .prepare(`
      SELECT ${PERFUME_SELECT_COLUMNS}
      FROM perfumes
    `)
    .all()
    .map(mapRow);

  for (const row of rows) {
    if (normalizeName(row.name) === target) {
      return row;
    }
  }

  return null;
}

function looksLikePerfumeCode(text) {
  const raw = normalizeCode(text);
  if (!raw) return false;
  return /^\d{1,4}[A-ZА-ЯІЇЄҐ]?$/.test(raw);
}

function splitCodes(value) {
  return String(value || "")
    .split(/[,\s;/|]+/)
    .map((x) => normalizeCode(x))
    .filter(Boolean);
}

function getAllWithCodes() {
  const rows = db
    .prepare(`
      SELECT ${PERFUME_SELECT_COLUMNS}
      FROM perfumes
      WHERE (number_code IS NOT NULL AND TRIM(number_code) <> '')
         OR (number_codes IS NOT NULL AND TRIM(number_codes) <> '')
    `)
    .all();

  return rows.map(mapRow);
}

function findByNumberCode(input) {
  const code = normalizeCode(input);
  if (!code) return null;

  const all = getAllWithCodes();

  for (const row of all) {
    const mainCode = normalizeCode(row.number_code);
    const extraCodes = splitCodes(row.number_codes);

    if (mainCode === code || extraCodes.includes(code)) {
      return row;
    }
  }

  return null;
}

function findAllByNumericCode(input) {
  const num = extractNumericCode(input);
  if (!num) return [];

  const all = getAllWithCodes();
  const out = [];

  for (const row of all) {
    const mainCode = normalizeCode(row.number_code);
    const extraCodes = splitCodes(row.number_codes);
    const allCodes = [mainCode, ...extraCodes].filter(Boolean);

    const matched = allCodes.some((c) => extractNumericCode(c) === num);
    if (matched) out.push(row);
  }

  const uniqMap = new Map();
  for (const item of out) {
    uniqMap.set(item.id, item);
  }

  return [...uniqMap.values()];
}

/* =========================
   Fast text / FTS search
========================= */

function hasPerfumesFts() {
  const row = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'perfumes_fts'
      LIMIT 1
    `)
    .get();

  return Boolean(row);
}

function escapeFtsToken(token) {
  return normalizeSearchText(token)
    .split(/\s+/)
    .join(" ")
    .replace(/"/g, "");
}

function uniqStrings(arr = []) {
  return [
    ...new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function buildFtsMatchQuery(input) {
  const rawTerms = Array.isArray(input) ? input : [input];

  const terms = uniqStrings(
    rawTerms
      .flatMap((x) => normalizeSearchText(x).split(/\s+/))
      .map((x) => escapeFtsToken(x))
      .filter((x) => x.length >= 2),
  ).slice(0, 16);

  if (!terms.length) return "";

  return terms.map((t) => `${t}*`).join(" OR ");
}

function buildLikeTerms(input) {
  const rawTerms = Array.isArray(input) ? input : [input];

  return uniqStrings(
    rawTerms
      .flatMap((x) => normalizeSearchText(x).split(/\s+/))
      .filter((x) => x.length >= 2),
  ).slice(0, 10);
}

function findWeightedLikeCandidates(query, limit = 120) {
  const terms = buildLikeTerms(query);
  if (!terms.length) return [];

  const whereParts = [];
  const params = { limit: Number(limit) };

  terms.forEach((term, idx) => {
    const key = `q${idx}`;
    params[key] = `%${term}%`;

    whereParts.push(`
      lower(coalesce(name, '')) LIKE @${key}
      OR lower(coalesce(version, '')) LIKE @${key}
      OR lower(coalesce(keywords, '')) LIKE @${key}
      OR lower(coalesce(notes, '')) LIKE @${key}
      OR lower(coalesce(number_code, '')) LIKE @${key}
      OR lower(coalesce(number_codes, '')) LIKE @${key}
      OR lower(coalesce(type, '')) LIKE @${key}
      OR lower(coalesce(for_whom, '')) LIKE @${key}
      OR lower(coalesce(description, '')) LIKE @${key}
      OR lower(coalesce(season, '')) LIKE @${key}
      OR lower(coalesce(occasion, '')) LIKE @${key}
    `);
  });

  const nameCond = terms.map((_, i) => `lower(coalesce(name, '')) LIKE @q${i}`).join(" OR ");
  const versionCond = terms.map((_, i) => `lower(coalesce(version, '')) LIKE @q${i}`).join(" OR ");
  const keywordCond = terms.map((_, i) => `lower(coalesce(keywords, '')) LIKE @q${i}`).join(" OR ");
  const notesCond = terms.map((_, i) => `lower(coalesce(notes, '')) LIKE @q${i}`).join(" OR ");
  const descriptionCond = terms.map((_, i) => `lower(coalesce(description, '')) LIKE @q${i}`).join(" OR ");
  const typeCond = terms.map((_, i) => `lower(coalesce(type, '')) LIKE @q${i}`).join(" OR ");

  const sql = `
    SELECT
      ${PERFUME_SELECT_COLUMNS},
      CASE
        WHEN ${nameCond} THEN 12000
        WHEN ${versionCond} THEN 11500
        WHEN ${keywordCond} THEN 8500
        WHEN ${notesCond} THEN 8000
        WHEN ${descriptionCond} THEN 4500
        WHEN ${typeCond} THEN 3500
        ELSE 2500
      END AS sql_score,
      CASE
        WHEN ${nameCond} THEN 'name'
        WHEN ${versionCond} THEN 'version'
        WHEN ${keywordCond} THEN 'keywords'
        WHEN ${notesCond} THEN 'notes'
        WHEN ${descriptionCond} THEN 'description'
        WHEN ${typeCond} THEN 'type'
        ELSE 'text'
      END AS sql_field
    FROM perfumes
    WHERE ${whereParts.map((x) => `(${x})`).join(" OR ")}
    ORDER BY sql_score DESC, id ASC
    LIMIT @limit
  `;

  return db.prepare(sql).all(params).map(mapRow);
}

function findWeightedFtsCandidates(query, limit = 120) {
  const match = buildFtsMatchQuery(query);
  if (!match) return [];

  try {
    const rows = db
      .prepare(`
        SELECT
          p.id,
          p.photo,
          p.name,
          p.number_code,
          p.number_codes,
          p.type,
          p.for_whom,
          p.season,
          p.occasion,
          p.age,
          p.notes,
          p.keywords,
          p.version,
          p.description,
          p.quote,
          CAST(10000 - (bm25(
            perfumes_fts,
            10.0, -- name
            5.0,  -- number_code
            4.0,  -- number_codes
            3.0,  -- type
            2.0,  -- for_whom
            7.0,  -- notes
            8.0,  -- keywords
            3.0,  -- description
            9.5,  -- version: alias-назви / переклади
            2.0,  -- season
            2.0   -- occasion
          ) * 1000) AS INTEGER) AS sql_score,
          'fts' AS sql_field
        FROM perfumes_fts
        JOIN perfumes p ON p.id = perfumes_fts.rowid
        WHERE perfumes_fts MATCH @match
        ORDER BY bm25(
          perfumes_fts,
          10.0,
          5.0,
          4.0,
          3.0,
          2.0,
          7.0,
          8.0,
          3.0,
          9.5,
          2.0,
          2.0
        ) ASC
        LIMIT @limit
      `)
      .all({
        match,
        limit: Number(limit),
      });

    return rows.map(mapRow);
  } catch (e) {
    console.error("[catalogRepo] FTS search failed, fallback to LIKE", {
      query,
      match,
      error: e?.message || String(e),
    });

    return findWeightedLikeCandidates(query, limit);
  }
}

function findWeightedTextCandidates(query, limit = 120) {
  if (!query || (Array.isArray(query) && !query.length)) return [];

  if (hasPerfumesFts()) {
    return findWeightedFtsCandidates(query, limit);
  }

  return findWeightedLikeCandidates(query, limit);
}

function rebuildPerfumesFts() {
  db.exec(`
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
  `);

  const perfumesCount =
    db.prepare(`SELECT COUNT(*) AS count FROM perfumes`).get()?.count || 0;
  const ftsCount =
    db.prepare(`SELECT COUNT(*) AS count FROM perfumes_fts`).get()?.count || 0;

  return {
    perfumesCount,
    ftsCount,
  };
}

module.exports = {
  getAllPerfumes,
  getPerfumeById,
  findByNameLike,
  findByExactName,
  findByNumberCode,
  findAllByNumericCode,
  looksLikePerfumeCode,
  normalizeCode,
  extractNumericCode,
  normalizeName,

  findWeightedTextCandidates,
  findWeightedFtsCandidates,
  findWeightedLikeCandidates,
  hasPerfumesFts,
  rebuildPerfumesFts,
};
