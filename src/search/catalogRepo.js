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

module.exports = {
  getAllPerfumes,
  getPerfumeById,
  findByNameLike,
  findByNumberCode,
  findAllByNumericCode,
  looksLikePerfumeCode,
  normalizeCode,
  extractNumericCode,
};