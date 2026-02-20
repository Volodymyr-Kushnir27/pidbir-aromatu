const db = require("../db/catalogDb");
const { EMBED_MODEL } = require("../config");

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeCode(code) {
  if (!code) return null;
  return String(code)
    .trim()
    .toUpperCase()
    // Cyrillic look-alikes -> Latin
    .replace(/А/g, "A")
    .replace(/В/g, "B")
    .replace(/С/g, "C")
    .replace(/Е/g, "E")
    .replace(/Н/g, "H")
    .replace(/К/g, "K")
    .replace(/М/g, "M")
    .replace(/О/g, "O")
    .replace(/Р/g, "P")
    .replace(/Т/g, "T")
    .replace(/Х/g, "X")
    .replace(/\s+/g, "");
}

function toCyrillicLookalikes(codeLat) {
  if (!codeLat) return null;
  return codeLat
    .replace(/A/g, "А")
    .replace(/B/g, "В")
    .replace(/C/g, "С")
    .replace(/E/g, "Е")
    .replace(/H/g, "Н")
    .replace(/K/g, "К")
    .replace(/M/g, "М")
    .replace(/O/g, "О")
    .replace(/P/g, "Р")
    .replace(/T/g, "Т")
    .replace(/X/g, "Х");
}

// Витягує "77A"/"77А" або "77" з тексту (перший збіг)
function extractNumberCode(text) {
  const t = String(text || "").toUpperCase();
  const m =
    t.match(/\b(\d{1,3}\s*[A-ZА-Я])\b/u) ||
    t.match(/\b(\d{1,3})\b/u);
  if (!m) return null;
  return normalizeCode(m[1]);
}

function getPerfumeSelectSQL() {
  // В тебе є photo, age, type — одразу тягнемо все для картки
  return `
    SELECT
      id,
      photo,
      number_code,
      name,
      premiere,
      type,
      for_whom,
      season,
      occasion,
      age,
      notes,
      keywords,
      description
    FROM perfumes
  `;
}

/**
 * Головний референсний пошук:
 * - якщо "77A/77А" -> exact number_code, інакше contains у name (лат+кирил)
 * - якщо "77" -> exact number_code, інакше name startsWith/contains
 */
function findPerfumeByCodeOrDigits(input) {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return null;

  const norm = normalizeCode(raw);
  if (!norm) return null;

  const isDigitsOnly = /^\d{1,3}$/.test(norm);
  const isCode = /^\d{1,3}[A-Z]$/.test(norm);

  const baseSelect = getPerfumeSelectSQL();

  // helper: exact number_code
  const findByNumberCodeExact = (code) => db.prepare(`
    ${baseSelect}
    WHERE UPPER(REPLACE(COALESCE(number_code,''),' ','')) = ?
    LIMIT 1
  `).get(code);

  // helper: name contains (both latin/cyr variants)
  const findByNameContains = (latinCode) => {
    const cyr = toCyrillicLookalikes(latinCode);
    return db.prepare(`
      ${baseSelect}
      WHERE UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
         OR UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
      ORDER BY LENGTH(COALESCE(name,''))
      LIMIT 1
    `).get(`%${latinCode}%`, `%${cyr}%`);
  };

  if (isCode) {
    const byNumber = findByNumberCodeExact(norm);
    if (byNumber) return byNumber;

    const byName = findByNameContains(norm);
    return byName || null;
  }

  if (isDigitsOnly) {
    const byNumber = findByNumberCodeExact(norm);
    if (byNumber) return byNumber;

    // name starts with 77 OR contains " 77"
    const byName = db.prepare(`
      ${baseSelect}
      WHERE UPPER(name) LIKE ? OR UPPER(name) LIKE ?
      ORDER BY
        CASE WHEN UPPER(name) LIKE ? THEN 0 ELSE 1 END,
        LENGTH(name)
      LIMIT 1
    `).get(
      `${norm}%`,     // "77..."
      `% ${norm}%`,   // "... 77..."
      `${norm}%`
    );

    return byName || null;
  }

  return null;
}

// Стара назва — лишаємо як alias (якщо десь використав)
function findPerfumeByNumberCode(numberCode) {
  return findPerfumeByCodeOrDigits(numberCode);
}

/**
 * Embedding дістаємо ТІЛЬКИ якщо таблиця існує.
 * Якщо perfume_embeddings ще не створена — поверне null, а не впаде.
 */
function getEmbeddingByPerfumeId(perfumeId) {
  try {
    const row = db.prepare(`
      SELECT embedding_json
      FROM perfume_embeddings
      WHERE perfume_id = ? AND model = ?
      LIMIT 1
    `).get(perfumeId, EMBED_MODEL);

    const vec = row ? safeJsonParse(row.embedding_json) : null;
    return Array.isArray(vec) ? vec : null;
  } catch (e) {
    // most likely: no such table perfume_embeddings
    return null;
  }
}

module.exports = {
  extractNumberCode,
  normalizeCode,
  toCyrillicLookalikes,
  findPerfumeByCodeOrDigits,
  findPerfumeByNumberCode,
  getEmbeddingByPerfumeId,
};
