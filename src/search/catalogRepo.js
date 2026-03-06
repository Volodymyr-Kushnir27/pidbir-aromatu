const db = require("../db/catalogDb");

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

    version: row.version || "",
    description: row.description || "",
    short_desc: row.description || "",

    quote: row.quote || "",
  };
}

function getAllPerfumes(limit = 1000) {
  const rows = db
    .prepare(`
      SELECT
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
      FROM perfumes
      LIMIT ?
    `)
    .all(Number(limit));

  return rows.map(mapRow);
}

function getPerfumeById(id) {
  const row = db
    .prepare(`
      SELECT
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
      SELECT
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
      FROM perfumes
      WHERE LOWER(name) LIKE LOWER(?)
      LIMIT ?
    `)
    .all(q, Number(limit));

  return rows.map(mapRow);
}

function looksLikePerfumeCode(text) {
  const raw = normalizeCode(text);

  if (!raw) return false;

  return /^[0-9]{1,4}[A-ZА-ЯІЇЄҐ]?$/.test(raw);
}

function splitCodes(value) {
  return String(value || "")
    .split(/[,\s;/|]+/)
    .map((x) => normalizeCode(x))
    .filter(Boolean);
}

function findByNumberCode(input) {
  const code = normalizeCode(input);
  if (!code) return null;

  const exact = db
    .prepare(`
      SELECT
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
      FROM perfumes
      WHERE UPPER(REPLACE(number_code, 'А', 'A')) = ?
      LIMIT 1
    `)
    .get(code);

  if (exact) return mapRow(exact);

  const rows = db
    .prepare(`
      SELECT
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
      FROM perfumes
      WHERE number_codes IS NOT NULL
        AND TRIM(number_codes) <> ''
    `)
    .all();

  for (const row of rows) {
    const codes = splitCodes(row.number_codes);
    if (codes.includes(code)) {
      return mapRow(row);
    }
  }

  return null;
}

module.exports = {
  getAllPerfumes,
  getPerfumeById,
  findByNameLike,
  findByNumberCode,
  looksLikePerfumeCode,
  normalizeCode,
};