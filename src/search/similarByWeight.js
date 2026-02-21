// src/search/similarByWeight.js
const db = require("../db/catalogDb");

// Підлаштуй SELECT під свої реальні колонки
function perfumeSelectSQL() {
  return `
    SELECT
      id,
      photo,
      number_code,
      name,
      type,
      for_whom,
      season,
      occasion,
      age,
      notes,
      keywords,
      version,
      description
    FROM perfumes
  `;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// щоб 60E і 60Е були однакові в текстових полях (мінімально)
function foldLookalikes(s) {
  return String(s || "")
    .replace(/А/g, "A").replace(/а/g, "a")
    .replace(/В/g, "B").replace(/в/g, "b")
    .replace(/С/g, "C").replace(/с/g, "c")
    .replace(/Е/g, "E").replace(/е/g, "e")
    .replace(/Є/g, "E").replace(/є/g, "e")
    .replace(/Н/g, "H").replace(/н/g, "h")
    .replace(/К/g, "K").replace(/к/g, "k")
    .replace(/М/g, "M").replace(/м/g, "m")
    .replace(/О/g, "O").replace(/о/g, "o")
    .replace(/Р/g, "P").replace(/р/g, "p")
    .replace(/Т/g, "T").replace(/т/g, "t")
    .replace(/Х/g, "X").replace(/х/g, "x")
    .replace(/І/g, "I").replace(/і/g, "i");
}

function splitTokens(s) {
  const t = norm(foldLookalikes(s));
  if (!t) return [];
  return [...new Set(t.split(/[^\p{L}\p{N}]+/u).filter(x => x.length >= 3))];
}

function scoreByWeights(ref, row) {
  const W = {
    name: 3,
    description: 8,
    for_whom: 10,
    season: 5,
    notes: 8,
    keywords: 3,
    version: 5,
    type: 2,
    age: 2,
  };

  const rf = {
    name: splitTokens(ref.name),
    description: splitTokens(ref.description),
    for_whom: splitTokens(ref.for_whom),
    season: splitTokens(ref.season),
    notes: splitTokens(ref.notes),
    keywords: splitTokens(ref.keywords),
    version: splitTokens(ref.version),
    type: splitTokens(ref.type),
    age: splitTokens(ref.age),
  };

  const tf = {
    name: norm(foldLookalikes(row.name)),
    description: norm(foldLookalikes(row.description)),
    for_whom: norm(foldLookalikes(row.for_whom)),
    season: norm(foldLookalikes(row.season)),
    notes: norm(foldLookalikes(row.notes)),
    keywords: norm(foldLookalikes(row.keywords)),
    version: norm(foldLookalikes(row.version)),
    type: norm(foldLookalikes(row.type)),
    age: norm(foldLookalikes(row.age)),
  };

  const hitCount = (hay, tokens) => {
    if (!tokens?.length) return 0;
    let c = 0;
    for (const tok of tokens) if (tok && hay.includes(tok)) c++;
    return c;
  };

  // БАЗОВЕ: рахуємо попадання токенів з референсу в поля кандидата
  let s = 0;
  s += W.name * hitCount(tf.name, rf.name);
  s += W.description * hitCount(tf.description, rf.description);

  // for_whom — найважливіше: якщо не збігається (і не унісекс) — сильний штраф
  // ПРАВИЛО:
  // - якщо ref "чолов" -> дозволяємо "чолов" або "унісекс"
  // - якщо ref "жіноч" -> дозволяємо "жіноч" або "унісекс"
  // - якщо ref "унісекс" -> тільки "унісекс"
  const refFW = tfFrom(ref.for_whom);
  const rowFW = tfFrom(row.for_whom);

  if (refFW === "unisex") {
    if (rowFW === "unisex") s += W.for_whom * 2;
    else s -= 9999;
  } else if (refFW === "male") {
    if (rowFW === "male" || rowFW === "unisex") s += W.for_whom * 2;
    else s -= 9999; // жіночий відсікаємо
  } else if (refFW === "female") {
    if (rowFW === "female" || rowFW === "unisex") s += W.for_whom * 2;
    else s -= 9999;
  } else {
    // якщо в референсі пусто — просто як текст
    s += W.for_whom * hitCount(tf.for_whom, rf.for_whom);
  }

  s += W.season * hitCount(tf.season, rf.season);
  s += W.notes * hitCount(tf.notes, rf.notes);
  s += W.keywords * hitCount(tf.keywords, rf.keywords);
  s += W.version * hitCount(tf.version, rf.version);
  s += W.type * hitCount(tf.type, rf.type);
  s += W.age * hitCount(tf.age, rf.age);

  // бонус: якщо notes/description перетинаються дуже сильно
  s += 2 * hitCount(tf.notes, rf.description);
  s += 2 * hitCount(tf.description, rf.notes);

  return s;
}

function tfFrom(for_whom) {
  const t = norm(for_whom);
  if (!t) return "unknown";
  if (t.includes("унісекс")) return "unisex";
  if (t.includes("чолов")) return "male";
  if (t.includes("жіноч")) return "female";
  return "unknown";
}

function getPerfumeById(id) {
  return db.prepare(`
    ${perfumeSelectSQL()}
    WHERE id = ?
    LIMIT 1
  `).get(id);
}

/**
 * Шукаємо кандидатів НЕ по всій БД тупо, а через recall-пошук:
 * беремо ключові токени з notes+description+name і робимо LIKE.
 * Потім rank за вагами.
 */
function loadCandidateRows(ref, maxCandidates = 400) {
  const tokens = [
    ...splitTokens(ref.notes),
    ...splitTokens(ref.description),
    ...splitTokens(ref.name),
  ].slice(0, 12);

  // якщо токенів нема — беремо по for_whom + season
  const wh = [];
  const params = [];

  // гендер (жорстко)
  const fw = tfFrom(ref.for_whom);
  if (fw === "unisex") {
    wh.push(`LOWER(COALESCE(for_whom,'')) LIKE ?`);
    params.push("%унісекс%");
  } else if (fw === "male") {
    wh.push(`(LOWER(COALESCE(for_whom,'')) LIKE ? OR LOWER(COALESCE(for_whom,'')) LIKE ?) AND LOWER(COALESCE(for_whom,'')) NOT LIKE ?`);
    params.push("%чолов%", "%унісекс%", "%жіноч%");
  } else if (fw === "female") {
    wh.push(`(LOWER(COALESCE(for_whom,'')) LIKE ? OR LOWER(COALESCE(for_whom,'')) LIKE ?) AND LOWER(COALESCE(for_whom,'')) NOT LIKE ?`);
    params.push("%жіноч%", "%унісекс%", "%чолов%");
  }

  if (tokens.length) {
    const ors = [];
    for (const tok of tokens) {
      ors.push(`LOWER(COALESCE(name,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(notes,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(description,'')) LIKE ?`);
      params.push(`%${tok}%`, `%${tok}%`, `%${tok}%`);
    }
    wh.push(`(${ors.join(" OR ")})`);
  }

  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const sql = `
    ${perfumeSelectSQL()}
    ${where}
    LIMIT ${Number(maxCandidates)}
  `;
  return db.prepare(sql).all(...params);
}

/**
 * Повертає top N схожих (default 3)
 */
function similarPerfumesByWeight(perfumeId, limit = 3) {
  const ref = getPerfumeById(perfumeId);
  if (!ref) return { ok: false, reason: "not_found", items: [] };

  const rows = loadCandidateRows(ref, 500).filter(r => Number(r.id) !== Number(perfumeId));

  const scored = rows
    .map(r => ({ r, s: scoreByWeights(ref, r) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.r);

  return { ok: true, items: scored };
}

module.exports = {
  similarPerfumesByWeight,
  getPerfumeById, // може стати в нагоді
};