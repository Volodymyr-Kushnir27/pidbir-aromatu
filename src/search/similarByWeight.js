// src/search/similarByWeight.js
const db = require("../db/catalogDb");

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

// Латинські/кириличні lookalikes зводимо до латиниці (для порівняння в JS)
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

// Токенізація: повертаємо одразу 2 набори токенів: original + folded
function splitTokensDual(s) {
  const raw = norm(s);
  const folded = norm(foldLookalikes(s));
  const split = (t) =>
    [...new Set(t.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3))];

  return {
    raw: split(raw),
    folded: split(folded),
  };
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

// ======= scoring =======
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

  // reference tokens (і raw, і folded)
  const rf = {
    name: splitTokensDual(ref.name),
    description: splitTokensDual(ref.description),
    for_whom: splitTokensDual(ref.for_whom),
    season: splitTokensDual(ref.season),
    notes: splitTokensDual(ref.notes),
    keywords: splitTokensDual(ref.keywords),
    version: splitTokensDual(ref.version),
    type: splitTokensDual(ref.type),
    age: splitTokensDual(ref.age),
  };

  // target fields (folded string — для includes)
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

  const hitCount = (hay, tokensFolded) => {
    if (!tokensFolded?.length) return 0;
    let c = 0;
    for (const tok of tokensFolded) if (tok && hay.includes(tok)) c++;
    return c;
  };

  let s = 0;

  // Базове попадання токенів ref -> у кандидата
  s += W.name * hitCount(tf.name, rf.name.folded);
  s += W.description * hitCount(tf.description, rf.description.folded);

  // Строгий for_whom фільтр
  const refFW = tfFrom(ref.for_whom);
  const rowFW = tfFrom(row.for_whom);

  if (refFW === "unisex") {
    if (rowFW === "unisex") s += W.for_whom * 2;
    else return -999999; // відсікли
  } else if (refFW === "male") {
    if (rowFW === "male" || rowFW === "unisex") s += W.for_whom * 2;
    else return -999999;
  } else if (refFW === "female") {
    if (rowFW === "female" || rowFW === "unisex") s += W.for_whom * 2;
    else return -999999;
  } else {
    s += W.for_whom * hitCount(tf.for_whom, rf.for_whom.folded);
  }

  s += W.season * hitCount(tf.season, rf.season.folded);

  const notesHits = hitCount(tf.notes, rf.notes.folded);
  const kwHits = hitCount(tf.keywords, rf.keywords.folded);

  s += W.notes * notesHits;
  s += W.keywords * kwHits;

  s += W.version * hitCount(tf.version, rf.version.folded);
  s += W.type * hitCount(tf.type, rf.type.folded);
  s += W.age * hitCount(tf.age, rf.age.folded);

  // бонусні перетини notes <-> description (щоб “алкогольний акцент” теж чіплявся)
  s += 2 * hitCount(tf.notes, rf.description.folded);
  s += 2 * hitCount(tf.description, rf.notes.folded);

  // ✅ штраф: якщо у ref є ноти, а перетину 0 — то це "не схоже"
  if (rf.notes.folded.length && notesHits === 0) {
    s -= 25;
  }

  return s;
}

// ======= candidates (recall) =======
function loadCandidateRows(ref, maxCandidates = 600) {
  // Беремо токени ширше: notes + keywords + description + name + version + type
  const parts = [
    splitTokensDual(ref.notes).raw,
    splitTokensDual(ref.keywords).raw,
    splitTokensDual(ref.description).raw,
    splitTokensDual(ref.name).raw,
    splitTokensDual(ref.version).raw,
    splitTokensDual(ref.type).raw,
  ];

  // плоский список, унікальний, обрізаємо
  const tokensRaw = [...new Set(parts.flat())]
    .filter(Boolean)
    .slice(0, 18); // трішки більше ніж 12

  const wh = [];
  const params = [];

  // гендер: робимо жорстко одразу в SQL
  const fw = tfFrom(ref.for_whom);
  if (fw === "unisex") {
    wh.push(`LOWER(COALESCE(for_whom,'')) LIKE ?`);
    params.push("%унісекс%");
  } else if (fw === "male") {
    wh.push(`
      (
        LOWER(COALESCE(for_whom,'')) LIKE ?
        OR LOWER(COALESCE(for_whom,'')) LIKE ?
      )
      AND LOWER(COALESCE(for_whom,'')) NOT LIKE ?
    `);
    params.push("%чолов%", "%унісекс%", "%жіноч%");
  } else if (fw === "female") {
    wh.push(`
      (
        LOWER(COALESCE(for_whom,'')) LIKE ?
        OR LOWER(COALESCE(for_whom,'')) LIKE ?
      )
      AND LOWER(COALESCE(for_whom,'')) NOT LIKE ?
    `);
    params.push("%жіноч%", "%унісекс%", "%чолов%");
  }

  // Якщо токени є — шукаємо по кількох полях (OR)
  if (tokensRaw.length) {
    const ors = [];
    for (const tok of tokensRaw) {
      // tok тут "як у БД" (raw), щоб LIKE реально знаходив
      ors.push(`LOWER(COALESCE(name,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(notes,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(description,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(keywords,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(version,'')) LIKE ?`);
      ors.push(`LOWER(COALESCE(type,'')) LIKE ?`);
      params.push(
        `%${tok}%`,
        `%${tok}%`,
        `%${tok}%`,
        `%${tok}%`,
        `%${tok}%`,
        `%${tok}%`,
      );
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

function similarPerfumesByWeight(perfumeId, limit = 3) {
  const ref = getPerfumeById(perfumeId);
  if (!ref) return { ok: false, reason: "not_found", items: [] };

  const rows = loadCandidateRows(ref, 700)
    .filter((r) => Number(r.id) !== Number(perfumeId));

  const scored = rows
    .map((r) => ({ r, s: scoreByWeights(ref, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);

  return { ok: true, items: scored };
}

module.exports = {
  similarPerfumesByWeight,
  getPerfumeById,
};