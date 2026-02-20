// src/search/catalogRepo.js
const db = require("../db/catalogDb");

let openai = null;
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

// Якщо у вас є клієнт OpenAI — підключимо тільки як "парсер запиту" (НЕ генерація парфумів)
try {
  ({ openai } = require("../llm/client"));
} catch {}

/* =========================
   Helpers
========================= */
function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Нормалізуємо код і прибираємо проблеми кирилиця/латинка
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
    .replace(/Є/g, "E") // важливо для укр.
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
   SQL select
========================= */
function perfumeSelectSQL() {
  return `
    SELECT
      id,
      photo,
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
  `
    )
    .get(id);
}

/* =========================
   CODE search returning MANY
========================= */
/**
 * Повертає список збігів (не 1!)
 * - якщо input "60" -> знайде "60A", "60E/149A" тощо (через name)
 * - якщо input "60E" -> знайде всі де є "60E" / "60Е"
 */
function findPerfumesByCodeOrDigits(input, { limit = 10 } = {}) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const norm = normalizeCode(raw);
  if (!norm) return [];

  const isDigitsOnly = /^\d{1,4}$/.test(norm);
  const isCode = /^\d{1,4}[A-Z]$/.test(norm);

  const latin = norm;
  const cyr = toCyrillicLookalikes(latin);

  // Шукаємо по NAME (бо у вас коди часто зашиті в name типу "60E/149A ...")
  if (isCode) {
    const rows = db
      .prepare(
        `
      ${perfumeSelectSQL()}
      WHERE UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
         OR UPPER(REPLACE(COALESCE(name,''),' ','')) LIKE ?
      ORDER BY id ASC
      LIMIT ?
    `
      )
      .all(`%${latin}%`, `%${cyr}%`, limit);

    return rows || [];
  }

  if (isDigitsOnly) {
    // digits: "60" має знайти і "60A", і "60E/149A", але не ловити "160"
    // Робимо точніші маски:
    // - початок рядка: "60"
    // - або " 60"
    // - або "60/" (типу 60E/149A)
    // - або "60A"/"60E" etc (через contains, але з пріоритетом)
    const rows = db
      .prepare(
        `
      ${perfumeSelectSQL()}
      WHERE
        UPPER(COALESCE(name,'')) LIKE ?            -- "60..."
        OR UPPER(COALESCE(name,'')) LIKE ?        -- "... 60..."
        OR UPPER(COALESCE(name,'')) LIKE ?        -- "...60/..."
        OR UPPER(COALESCE(name,'')) LIKE ?        -- "...60A..."
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(name,'')) LIKE ? THEN 0
          WHEN UPPER(COALESCE(name,'')) LIKE ? THEN 1
          ELSE 2
        END,
        id ASC
      LIMIT ?
    `
      )
      .all(
        `${latin}%`,
        `% ${latin}%`,
        `%${latin}/%`,
        `%${latin}%`,
        `${latin}%`,
        `% ${latin}%`,
        limit
      );

    return rows || [];
  }

  return [];
}

/* =========================
   LLM parsing (only to JSON)
========================= */
async function llmParseQueryToJSON(userText) {
  if (!openai) return null;

  const sys = `
You are a parser for a perfume store assistant. Convert user request into JSON for SQL search.
Do NOT invent perfumes. Do NOT output explanations. Return ONLY valid JSON.

Schema:
{
  "name_terms": string[],
  "for_whom": "жіночий"|"чоловічий"|"унісекс"|null,
  "season": string[],
  "type": string[],
  "age": string[],
  "notes": string[],
  "keywords": string[],
  "version_terms": string[]
}

Rules:
- If user asks "алкогольні ноти", expand to common alcohol-related notes (UA/RU/EN).
- If user asks "цитрус", expand to citrus notes.
- Max 12 items per array. Prefer Ukrainian.
`;

  const resp = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: sys.trim() },
      { role: "user", content: String(userText || "").slice(0, 2000) },
    ],
  });

  const txt = resp.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(txt);
  if (!parsed || typeof parsed !== "object") return null;

  const cleanArr = (a) =>
    Array.isArray(a)
      ? [...new Set(a.map((x) => normText(x)).filter(Boolean))].slice(0, 12)
      : [];

  const fw = parsed.for_whom ? normText(parsed.for_whom) : null;
  const forWhom =
    fw === "жіночий" || fw === "чоловічий" || fw === "унісекс" ? fw : null;

  return {
    name_terms: cleanArr(parsed.name_terms),
    for_whom: forWhom,
    season: cleanArr(parsed.season),
    type: cleanArr(parsed.type),
    age: cleanArr(parsed.age),
    notes: cleanArr(parsed.notes),
    keywords: cleanArr(parsed.keywords),
    version_terms: cleanArr(parsed.version_terms),
  };
}

/* =========================
   Heuristic parse (no OpenAI)
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

  // стать
  if (/\bунісекс\b/.test(t)) out.for_whom = "унісекс";
  else if (/\bжіноч(ий|а)\b/.test(t)) out.for_whom = "жіночий";
  else if (/\bчоловіч(ий|а)\b/.test(t)) out.for_whom = "чоловічий";

  // сезони
  for (const s of ["весна", "літо", "осінь", "зима"]) {
    if (t.includes(s)) out.season.push(s);
  }

  // алкоголь (мінімально, але реально корисно)
  if (t.includes("алког") || t.includes("vodka") || t.includes("водка") || t.includes("горіл")) {
    out.notes.push(
      "алкоголь",
      "горілка",
      "водка",
      "vodka",
      "віскі",
      "whisky",
      "whiskey",
      "ром",
      "rum",
      "коньяк",
      "cognac",
      "бренді",
      "brandy",
      "джин",
      "gin",
      "лікер",
      "liqueur",
      "вино",
      "wine",
      "шампанське",
      "champagne",
      "бурбон",
      "bourbon"
    );
  }

  // цитрус
  if (t.includes("цитрус")) {
    out.notes.push(
      "лимон",
      "lemon",
      "апельсин",
      "orange",
      "бергамот",
      "bergamot",
      "мандарин",
      "tangerine",
      "грейпфрут",
      "grapefruit",
      "лайм",
      "lime"
    );
  }

  // ключові слова з тексту (щоб хоча б щось шукало без LLM)
  const tokens = t.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3);
  out.keywords = [...new Set(tokens)].slice(0, 12);

  return out;
}

/* =========================
   Gender filtering rules
========================= */
function genderAllowed(rowForWhomRaw, queryForWhom /* "чоловічий"/"жіночий"/"унісекс"/null */) {
  if (!queryForWhom) return true; // якщо не вказано стать — не ріжемо

  const fw = normText(rowForWhomRaw);

  const isMale = fw.includes("чолов");
  const isFemale = fw.includes("жін");
  const isUnisex = fw.includes("унісекс") || fw.includes("unisex");

  if (queryForWhom === "унісекс") {
    return isUnisex;
  }

  if (queryForWhom === "чоловічий") {
    return isMale || isUnisex;
  }

  if (queryForWhom === "жіночий") {
    return isFemale || isUnisex;
  }

  return true;
}

/* =========================
   Candidate SQL building
========================= */
function buildCandidateSQL(parsed) {
  // Пошук по полях у вашому пріоритеті (але через OR, щоб не душити видачу)
  // Потім відранжуємо scoreRow()
  const wh = [];
  const params = [];

  const likeAny = (field, terms) => {
    if (!terms || !terms.length) return;
    const ors = terms.map(() => `LOWER(COALESCE(${field},'')) LIKE ?`).join(" OR ");
    wh.push(`(${ors})`);
    for (const term of terms) params.push(`%${term}%`);
  };

  // пріоритети (запити)
  likeAny("name", parsed.name_terms);

  // стать як candidate (але фінально фільтруємо в JS жорстко)
  if (parsed.for_whom) {
    wh.push(`LOWER(COALESCE(for_whom,'')) LIKE ?`);
    params.push(`%${parsed.for_whom}%`);
  }

  likeAny("season", parsed.season);
  likeAny("notes", parsed.notes);
  likeAny("keywords", parsed.keywords);
  likeAny("version", parsed.version_terms);
  likeAny("type", parsed.type);
  likeAny("age", parsed.age);

  // ДОДАЛИ description в retrieval
  likeAny("description", parsed.notes);     // ноти можуть бути в описі
  likeAny("description", parsed.keywords);  // і ключові слова також

  const where = wh.length ? `WHERE ${wh.join(" OR ")}` : "";
  const sql = `
    ${perfumeSelectSQL()}
    ${where}
    LIMIT 400
  `;

  return { sql, params };
}

/* =========================
   Scoring
========================= */
function scoreRow(row, parsed) {
  // weights: ваш пріоритет (назва -> ... -> вік) + description=6 + notes=6
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

  // name
  s += W.name * hitCount(fields.name, parsed.name_terms);

  // for_whom (точне попадання)
  if (parsed.for_whom && fields.for_whom.includes(parsed.for_whom)) s += W.for_whom;

  // season
  s += W.season * hitCount(fields.season, parsed.season);

  // notes (плюс у description, бо часто там пишуть "пряно-алкогольний акцент")
  s += W.notes * hitCount(fields.notes, parsed.notes);
  s += Math.floor(W.notes / 2) * hitCount(fields.description, parsed.notes);

  // keywords
  s += W.keywords * hitCount(fields.keywords, parsed.keywords);

  // version
  s += W.version * hitCount(fields.version, parsed.version_terms);

  // type
  s += W.type * hitCount(fields.type, parsed.type);

  // age
  s += W.age * hitCount(fields.age, parsed.age);

  // description (окремо)
  s += W.description * hitCount(fields.description, parsed.keywords);

  // бонус: якщо name містить keywords
  s += 1 * hitCount(fields.name, parsed.keywords);

  return s;
}

/* =========================
   Main Smart Search
========================= */
async function searchPerfumesSmart(userText, { limit = 5 } = {}) {
  const text = String(userText || "").trim();
  if (!text) return { mode: "smart", items: [], parsed: null };

  // 0) code short-circuit: якщо є код/номер — повертаємо всі збіги
  const code = extractNumberCode(text);
  if (code) {
    const items = findPerfumesByCodeOrDigits(code, { limit: Math.max(limit, 10) });
    if (items.length) {
      return { mode: "code", items, parsed: { code } };
    }
  }

  // 1) parsed query
  let parsed = await llmParseQueryToJSON(text);
  if (!parsed) parsed = heuristicParse(text);

  // 2) candidates from DB
  const { sql, params } = buildCandidateSQL(parsed);
  const rows = db.prepare(sql).all(...params);

  // 3) rank + strict gender filtering
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

  // code helpers
  extractNumberCode,
  normalizeCode,
  toCyrillicLookalikes,

  // code search (many)
  findPerfumesByCodeOrDigits,

  // smart search
  searchPerfumesSmart,
};