// src/search/catalogRepo.js
const db = require("../db/catalogDb");
const { chatJSONSchema } = require("../llm/client");

/* =========================
   Text helpers
========================= */
function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function capFirst(s) {
  const t = String(s || "");
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

/**
 * SQLite case-insensitive для UA працює погано.
 * Тому під SQL даємо кілька варіантів регістру.
 * А фінальне ранжування робимо в JS (Unicode ok).
 */
function termVariants(term) {
  const t = String(term || "").trim();
  if (!t) return [];
  const lower = t.toLowerCase();
  const set = new Set([t, lower, t.toUpperCase(), capFirst(lower)]);
  return [...set].filter(Boolean).slice(0, 4);
}

/* =========================
   Code helpers
========================= */
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
    .replace(/Є/g, "E")
    .replace(/Н/g, "H")
    .replace(/І/g, "I")
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
  return String(codeLat)
    .replace(/A/g, "А")
    .replace(/B/g, "В")
    .replace(/C/g, "С")
    .replace(/E/g, "Е")
    .replace(/H/g, "Н")
    .replace(/I/g, "І")
    .replace(/K/g, "К")
    .replace(/M/g, "М")
    .replace(/O/g, "О")
    .replace(/P/g, "Р")
    .replace(/T/g, "Т")
    .replace(/X/g, "Х");
}

/**
 * Витягує код/номер з тексту:
 * - 60E / 60Е / 77A / 77А
 * - або 60 / 77
 * - також спрацьовує якщо в тексті "60Е/149A" -> дістане "60Е"
 */
function extractNumberCode(text) {
  const t = String(text || "").toUpperCase();

  // пріоритет: цифри + літера
  const m1 = t.match(/\b(\d{1,4}\s*[A-ZА-ЯЄІ])\b/u);
  if (m1) return normalizeCode(m1[1]);

  // далі: просто цифри
  const m2 = t.match(/\b(\d{1,4})\b/u);
  if (m2) return normalizeCode(m2[1]);

  return null;
}

/* =========================
   Adaptive SELECT (schema-safe)
========================= */
let _perfumeColsCache = null;

function getPerfumeColumns() {
  if (_perfumeColsCache) return _perfumeColsCache;
  try {
    const rows = db.prepare(`PRAGMA table_info('perfumes')`).all();
    _perfumeColsCache = new Set(rows.map((r) => String(r.name)));
  } catch {
    _perfumeColsCache = new Set();
  }
  return _perfumeColsCache;
}

// Поля, які хочемо мати у результаті (якщо нема в БД → NULL AS field)
const PERFUME_FIELDS = [
  "id",
  "photo",
  "number_code",
  "name",
  "premiere",
  "type",
  "for_whom",
  "season",
  "occasion",
  "age",
  "notes",
  "keywords",
  "version",
  "description",
  "projection",
  "komu",
];

function selectFieldOrNull(field, cols) {
  return cols.has(field) ? field : `NULL AS ${field}`;
}

function perfumeSelectSQL() {
  const cols = getPerfumeColumns();
  const selectList = PERFUME_FIELDS.map((f) => selectFieldOrNull(f, cols)).join(
    ",\n      ",
  );
  return `
    SELECT
      ${selectList}
    FROM perfumes
  `;
}

/* =========================
   Basic getter
========================= */
function getPerfumeById(id) {
  return db
    .prepare(
      `
    ${perfumeSelectSQL()}
    WHERE id = ?
    LIMIT 1
  `,
    )
    .get(id);
}

/* =========================
   Find by name (reference lookup)
========================= */
function findPerfumesByNameLike(nameOrPart, { limit = 10 } = {}) {
  const q = normText(nameOrPart);
  if (!q) return [];

  const tokens = q
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length >= 3)
    .slice(0, 6);

  if (!tokens.length) return [];

  // SQL без LOWER, даємо варіанти регістру
  const wh = [];
  const params = [];
  for (const t of tokens) {
    const vars = termVariants(t);
    const ors = vars.map(() => `COALESCE(name,'') LIKE ?`).join(" OR ");
    wh.push(`(${ors})`);
    for (const v of vars) params.push(`%${v}%`);
  }

  const sql = `
    ${perfumeSelectSQL()}
    WHERE ${wh.join(" AND ")}
    ORDER BY LENGTH(COALESCE(name,'')) ASC
    LIMIT ?
  `;

  return db.prepare(sql).all(...params, limit) || [];
}

/* =========================
   CODE search returning MANY
========================= */
function findPerfumesByCodeOrDigits(input, { limit = 10 } = {}) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const norm = normalizeCode(raw);
  if (!norm) return [];

  const isDigitsOnly = /^\d{1,4}$/.test(norm);
  const isCode = /^\d{1,4}[A-Z]$/.test(norm);

  const latin = norm;
  const cyr = toCyrillicLookalikes(latin);

  if (isCode) {
    const rows = db
      .prepare(
        `
      ${perfumeSelectSQL()}
      WHERE UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
         OR UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
      ORDER BY id ASC
      LIMIT ?
    `,
      )
      .all(`%${latin}%`, `%${cyr}%`, limit);

    return rows || [];
  }

  if (isDigitsOnly) {
    const rows = db
      .prepare(
        `
      ${perfumeSelectSQL()}
      WHERE
        UPPER(COALESCE(name,'')) LIKE ?
        OR UPPER(COALESCE(name,'')) LIKE ?
        OR UPPER(COALESCE(name,'')) LIKE ?
        OR UPPER(COALESCE(name,'')) LIKE ?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(name,'')) LIKE ? THEN 0
          WHEN UPPER(COALESCE(name,'')) LIKE ? THEN 1
          ELSE 2
        END,
        id ASC
      LIMIT ?
    `,
      )
      .all(
        `${latin}%`,
        `% ${latin}%`,
        `%${latin}/%`,
        `%${latin}%`,
        `${latin}%`,
        `% ${latin}%`,
        limit,
      );

    return rows || [];
  }

  return [];
}

/* =========================
   LLM parsing (Responses JSON Schema)
========================= */
const SmartParseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name_terms",
    "for_whom",
    "season",
    "type",
    "age",
    "notes",
    "keywords",
    "version_terms",
  ],
  properties: {
    name_terms: { type: "array", items: { type: "string" }, maxItems: 12 },
    for_whom: {
      anyOf: [
        { type: "string", enum: ["жіночий", "чоловічий", "унісекс"] },
        { type: "null" },
      ],
    },
    season: { type: "array", items: { type: "string" }, maxItems: 12 },
    type: { type: "array", items: { type: "string" }, maxItems: 12 },
    age: { type: "array", items: { type: "string" }, maxItems: 12 },
    notes: { type: "array", items: { type: "string" }, maxItems: 12 },
    keywords: { type: "array", items: { type: "string" }, maxItems: 12 },
    version_terms: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
};

function cleanArr(a) {
  if (!Array.isArray(a)) return [];
  return [...new Set(a.map((x) => normText(x)).filter(Boolean))].slice(0, 12);
}

async function llmParseQueryToJSON(userText) {
  const sys = `
Ти — парсер запиту для пошуку парфумів у SQLite.
Поверни ТІЛЬКИ JSON за схемою (без пояснень).
НЕ вигадуй парфуми. Працюй тільки з ознаками (стать/сезон/тип/ноти/ключові слова).

Правила:
- максимум 12 елементів у масивах
- перевага українській
- якщо користувач каже "цитрус" — додай: лимон, бергамот, мандарин, грейпфрут, лайм, апельсин
- якщо каже "алкогольні ноти" — додай: віскі, ром, коньяк, джин, лікер, шампанське, бренді
- якщо користувач пише "коньяк" — додай також: cognac, brandy (на випадок EN у базі)
- якщо пише "ромашка" — додай: chamomile
- якщо пише "груша" — додай: pear
`.trim();

  const obj = await chatJSONSchema(sys, String(userText || "").slice(0, 2000), {
    name: "smart_query",
    schema: SmartParseSchema,
    temperature: 0.1,
  });

  return {
    name_terms: cleanArr(obj.name_terms),
    for_whom: obj.for_whom ?? null,
    season: cleanArr(obj.season),
    type: cleanArr(obj.type),
    age: cleanArr(obj.age),
    notes: cleanArr(obj.notes),
    keywords: cleanArr(obj.keywords),
    version_terms: cleanArr(obj.version_terms),
  };
}

/* =========================
   Heuristic parse fallback
========================= */
function heuristicParse(userText) {
  const t = normText(userText);

  const out = {
    name_terms: [],
    for_whom: null,
    season: [],
    type: [],
    age: [],
    notes: [],
    keywords: [],
    version_terms: [],
  };

  if (/\bунісекс\b/.test(t)) out.for_whom = "унісекс";
  else if (/\bжіноч(ий|а)\b/.test(t)) out.for_whom = "жіночий";
  else if (/\bчоловіч(ий|а)\b/.test(t)) out.for_whom = "чоловічий";

  for (const s of ["весна", "літо", "осінь", "зима"]) {
    if (t.includes(s)) out.season.push(s);
  }

  // прості синоніми (на випадок, якщо LLM не відпрацював)
  if (t.includes("коньяк")) out.notes.push("коньяк", "cognac", "brandy", "бренді");
  if (t.includes("ромашк")) out.notes.push("ромашка", "chamomile");
  if (t.includes("груш")) out.notes.push("груша", "pear");

  const tokens = t
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length >= 3);

  out.keywords = [...new Set(tokens)].slice(0, 12);
  return out;
}

/* =========================
   Gender filtering rules (JS Unicode ok)
========================= */
function genderAllowed(rowForWhomRaw, queryForWhom) {
  if (!queryForWhom) return true;

  const fw = normText(rowForWhomRaw);
  const isMale = fw.includes("чолов");
  const isFemale = fw.includes("жін");
  const isUnisex = fw.includes("унісекс") || fw.includes("unisex");

  if (queryForWhom === "унісекс") return isUnisex;
  if (queryForWhom === "чоловічий") return isMale || isUnisex;
  if (queryForWhom === "жіночий") return isFemale || isUnisex;
  return true;
}

/* =========================
   Candidate SQL building (NO LOWER)
========================= */
function buildCandidateSQL(parsed) {
  const wh = [];
  const params = [];

  const likeAny = (field, terms) => {
    if (!terms || !terms.length) return;

    const ors = [];
    for (const term of terms) {
      const vars = termVariants(term);
      for (const v of vars) {
        ors.push(`COALESCE(${field},'') LIKE ?`);
        params.push(`%${v}%`);
      }
    }
    if (ors.length) wh.push(`(${ors.join(" OR ")})`);
  };

  likeAny("name", parsed.name_terms);
  likeAny("season", parsed.season);
  likeAny("notes", parsed.notes);
  likeAny("keywords", parsed.keywords);
  likeAny("version", parsed.version_terms);
  likeAny("type", parsed.type);
  likeAny("age", parsed.age);

  // notes/keywords можуть бути в description
  likeAny("description", parsed.notes);
  likeAny("description", parsed.keywords);

  const where = wh.length ? `WHERE ${wh.join(" OR ")}` : "";
  const sql = `
    ${perfumeSelectSQL()}
    ${where}
    LIMIT 900
  `;

  return { sql, params };
}

/* =========================
   Scoring (JS, Unicode ok)
========================= */
function scoreRow(row, parsed) {
  const W = {
    name: 10,
    description: 6,
    for_whom: 6,
    season: 5,
    notes: 6,
    keywords: 3,
    version: 3,
    type: 2,
    age: 2,
  };

  const fields = {
    name: normText(row.name),
    description: normText(row.description),
    for_whom: normText(row.for_whom),
    season: normText(row.season),
    notes: normText(row.notes),
    keywords: normText(row.keywords),
    version: normText(row.version),
    type: normText(row.type),
    age: normText(row.age),
  };

  const hitCount = (hay, terms) => {
    if (!terms?.length) return 0;
    let c = 0;
    for (const term of terms) {
      const tt = normText(term);
      if (tt && hay.includes(tt)) c++;
    }
    return c;
  };

  let s = 0;

  s += W.name * hitCount(fields.name, parsed.name_terms);
  if (parsed.for_whom && fields.for_whom.includes(parsed.for_whom)) s += W.for_whom;
  s += W.season * hitCount(fields.season, parsed.season);

  const notesHits = hitCount(fields.notes, parsed.notes);
  s += W.notes * notesHits;
  s += Math.floor(W.notes / 2) * hitCount(fields.description, parsed.notes);

  s += W.keywords * hitCount(fields.keywords, parsed.keywords);
  s += W.version * hitCount(fields.version, parsed.version_terms);
  s += W.type * hitCount(fields.type, parsed.type);
  s += W.age * hitCount(fields.age, parsed.age);

  s += W.description * hitCount(fields.description, parsed.keywords);
  s += 1 * hitCount(fields.name, parsed.keywords);

  // штраф: просили ноти, а їх взагалі нема в записі
  if (parsed.notes?.length && notesHits === 0) s -= 10;

  return s;
}

/* =========================
   Main Smart Search (SQL + fallback)
========================= */
async function searchPerfumesSmart(userText, { limit = 5 } = {}) {
  const text = String(userText || "").trim();
  if (!text) return { mode: "smart", items: [], parsed: null };

  // 0) code shortcut
  const code = extractNumberCode(text);
  if (code) {
    const items = findPerfumesByCodeOrDigits(code, { limit: Math.max(limit, 10) });
    if (items.length) return { mode: "code", items, parsed: { code } };
  }

  // 1) parse
  let parsed = null;
  try {
    parsed = await llmParseQueryToJSON(text);
  } catch {
    parsed = null;
  }
  if (!parsed) parsed = heuristicParse(text);

  // 2) candidates (attempt 1)
  let rows = [];
  try {
    const { sql, params } = buildCandidateSQL(parsed);
    rows = db.prepare(sql).all(...params);
  } catch {
    rows = [];
  }

  // 2.5) fallback pool (bypass SQLite UA case issues)
  if (!rows.length) {
    // беремо широкий пул, щоб JS міг знайти збіги по UA
    rows = db.prepare(`${perfumeSelectSQL()} LIMIT 1500`).all();
  }

  // 3) rank
  const scored = rows
    .filter((r) => genderAllowed(r.for_whom, parsed.for_whom))
    .map((r) => ({ r, score: scoreRow(r, parsed) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);

  return { mode: "smart", items: scored, parsed };
}

/* =========================
   Exports
========================= */
module.exports = {
  // базові
  getPerfumeById,
  findPerfumesByNameLike,

  // code helpers
  extractNumberCode,
  normalizeCode,
  toCyrillicLookalikes,

  // code search (many)
  findPerfumesByCodeOrDigits,

  // smart search
  searchPerfumesSmart,
};