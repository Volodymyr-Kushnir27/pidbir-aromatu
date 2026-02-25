// src/search/smartSearchPipeline.js
const db = require("../db/catalogDb");
const { chatJSONSchema } = require("../llm/client");

/* =========================
   Utils
========================= */
function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function uniq(arr, max = 24) {
  return [...new Set((arr || []).map(norm).filter(Boolean))].slice(0, max);
}

function capFirst(s) {
  const t = String(s || "");
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

function termVariants(t) {
  const s = String(t || "").trim();
  if (!s) return [];
  const low = s.toLowerCase();
  const set = new Set([s, low, s.toUpperCase(), capFirst(low)]);
  return [...set].filter(Boolean).slice(0, 4);
}

/* =========================
   Multilingual helpers (UA/RU/EN)
========================= */
function translitCyrToLat(input) {
  // IMPORTANT: always lower() to support "Виктория" / "ВІКТОРІЯ"
  const s = String(input || "").toLowerCase();
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "h",
    ґ: "g",
    д: "d",
    е: "e",
    є: "ye",
    ж: "zh",
    з: "z",
    и: "y",
    і: "i",
    ї: "yi",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ь: "",
    ю: "yu",
    я: "ya",

    // RU extras
    ё: "yo",
    ъ: "",
    ы: "y",
    э: "e",
  };
  return s
    .split("")
    .map((ch) => (map[ch] ? map[ch] : ch))
    .join("");
}

const BRAND_SYNONYMS = [
  {
    key: "victoria's secret",
    variants: [
      "victoria secret",
      "victorias secret",
      "victoria’s secret",
      "victoria s secret",
      "виктория сикрет",
      "виктория секрет",
      "вікторія сікрет",
      "вікторія секрет",
    ],
  },
];

function expandMultilingualTerms(terms) {
  const out = new Set();

  const push = (x) => {
    const t = String(x || "").trim();
    if (t) out.add(t);
  };

  for (const t of terms || []) {
    push(t);

    // cyrillic -> translit
    if (/[А-Яа-яЁёЄєІіЇїҐґ]/.test(t)) {
      const tr = translitCyrToLat(t);
      push(tr);
      push(tr.toLowerCase());
    }
  }

  // brand synonyms (both directions)
  const all = Array.from(out).map((x) => x.toLowerCase());
  for (const b of BRAND_SYNONYMS) {
    const key = b.key.toLowerCase();
    const has =
      all.some((x) => x.includes(key)) ||
      b.variants.some((v) =>
        all.some((x) => x.includes(String(v).toLowerCase())),
      );

    if (has) {
      push(b.key);
      for (const v of b.variants) push(v);
    }
  }

  // normalize "victoria secret" -> "victoria's secret"
  for (const v of Array.from(out)) {
    const low = v.toLowerCase();
    if (low.includes("victoria secret")) {
      push(v.replace(/\bvictoria secret\b/gi, "Victoria's Secret"));
      push(low.replace(/\bvictoria secret\b/g, "victoria's secret"));
    }
  }

  // apostrophes variations
  for (const v of Array.from(out)) {
    push(v.replace(/['’]/g, ""));
  }

  return Array.from(out).slice(0, 40);
}

/* =========================
   Token-boundary match
========================= */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeWord(hay, term) {
  const t = norm(term);
  if (!t) return false;
  const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(t)}([^\\p{L}]|$)`, "iu");
  return re.test(hay);
}

/* =========================
   Gender detection
========================= */
// IMPORTANT: must return: "жіночий" | "чоловічий" | "унісекс"
function detectForWhomFromText(text) {
  const t = String(text || "").toLowerCase();

  if (/(унісекс|унисекс|unisex)/i.test(t)) return "унісекс";
  if (/(чол(овічі|овічий)?|муж(ской|ские)?|men|male)/i.test(t))
    return "чоловічий";
  if (/(жін(очі|очий)?|жен(ский|ские)?|women|female)/i.test(t))
    return "жіночий";

  return null;
}

function detectGenderHeuristic(text) {
  const t = norm(text);
  if (/(^|[\s,;])(унісекс|unisex)([\s,;]|$)/i.test(t)) return "унісекс";
  if (/(^|[\s,;])(чолов|муж|men|man|male)([\s,;]|$)/i.test(t))
    return "чоловічий";
  if (/(^|[\s,;])(жін|жен|women|woman|female)([\s,;]|$)/i.test(t))
    return "жіночий";
  return null;
}

/* =========================
   Meaningful tokens fallback
========================= */
const STOP = new Set(
  [
    "топ",
    "top",
    "найкращі",
    "кращі",
    "варіанти",
    "аромат",
    "аромати",
    "парфум",
    "парфуми",
    "духи",
    "версія",
    "схоже",
    "схожі",
    "на",
    "підбери",
    "знайди",
    "please",
    "show",
    "like",
    "similar",
    "to",
    "and",
    "or",
    "the",
    "a",
    "an",
  ].map(norm),
);

function extractMeaningfulTokens(text, { max = 12 } = {}) {
  const raw = String(text || "")
    .replace(/[()"'“”]/g, " ")
    .replace(/[.,!?/\\|:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = raw.split(" ").map(norm).filter(Boolean);

  const tokens = [];
  for (const p of parts) {
    if (p.length < 4) continue;
    if (STOP.has(p)) continue;
    if (/^\d+$/.test(p)) continue;
    tokens.push(p);
    if (tokens.length >= max) break;
  }
  return uniq(tokens, max);
}

/* =========================
   1) Query Understanding (Ontology)
========================= */
const QuerySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "note_terms",
    "note_categories",
    "include_terms",
    "exclude_terms",
    "for_whom",
    "season",
    "type",
    "search_mode",
    "min_confidence",
  ],
  properties: {
    intent: { type: "string", enum: ["find", "similar", "unknown"] },
    note_terms: { type: "array", items: { type: "string" }, maxItems: 24 },
    note_categories: { type: "array", items: { type: "string" }, maxItems: 12 },
    include_terms: { type: "array", items: { type: "string" }, maxItems: 24 },
    exclude_terms: { type: "array", items: { type: "string" }, maxItems: 24 },
    for_whom: {
      anyOf: [
        { type: "string", enum: ["жіночий", "чоловічий", "унісекс"] },
        { type: "null" },
      ],
    },
    season: { type: "array", items: { type: "string" }, maxItems: 8 },
    type: { type: "array", items: { type: "string" }, maxItems: 8 },
    search_mode: { type: "string", enum: ["fts", "hybrid", "fallback"] },
    min_confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

async function understandQuery(userText) {
  const sys = `
Ти — Query Understanding для пошуку парфумів у SQLite.
Поверни ТІЛЬКИ JSON за схемою. НЕ вигадуй парфуми.

Онтологія/синоніми (приклади):
- "сигарета" -> ["тютюн","дим","сигарета","tobacco","smoke"], category "tobacco_smoke"
- "алкогольні ноти" -> ["ром","віскі","коньяк","бренді","джин","лікер","rum","whisky","cognac","brandy","gin","liqueur"], category "boozy"
- "зелений чай" -> ["зелений чай","tea","green tea"]
- "ромашка" -> ["ромашка","chamomile"]
- "груша" -> ["груша","pear"]
- exclude_terms заповнюй, якщо користувач каже "без ..."

search_mode:
- "fts" якщо запит точний по словах/нотах
- "hybrid" якщо змішано
- "fallback" якщо дуже загально
min_confidence: 0.6 за замовчуванням (нижче якщо нечітко).
`.trim();

  const obj = await chatJSONSchema(sys, String(userText || "").slice(0, 2000), {
    name: "query_understanding",
    schema: QuerySchema,
    temperature: 0.1,
  });

  const g = detectGenderHeuristic(userText);

  const out = {
    intent: obj.intent || "unknown",
    note_terms: uniq(obj.note_terms, 24),
    note_categories: uniq(obj.note_categories, 12),
    include_terms: uniq(obj.include_terms, 24),
    exclude_terms: uniq(obj.exclude_terms, 24),
    for_whom: (g || obj.for_whom) ?? null,
    season: uniq(obj.season, 8),
    type: uniq(obj.type, 8),
    search_mode: obj.search_mode || "hybrid",
    min_confidence:
      typeof obj.min_confidence === "number" ? obj.min_confidence : 0.6,
  };

  // multilingual expansions (UA/RU/EN + translit + brand aliases)
  out.note_terms = uniq(expandMultilingualTerms(out.note_terms), 24);
  out.include_terms = uniq(expandMultilingualTerms(out.include_terms), 24);
  out.season = uniq(expandMultilingualTerms(out.season), 8);
  out.type = uniq(expandMultilingualTerms(out.type), 8);

  const termsCount =
    out.note_terms.length +
    out.include_terms.length +
    out.season.length +
    out.type.length;

  // if LLM returned empty -> fallback tokens from text (prevents same top every time)
  if (termsCount === 0) {
    out.include_terms = uniq(
      expandMultilingualTerms([
        ...out.include_terms,
        ...extractMeaningfulTokens(userText, { max: 10 }),
      ]),
      24,
    );
    out.search_mode = "fallback";
    out.min_confidence = Math.min(out.min_confidence, 0.4);
  }

  return out;
}

/* =========================
   1b) Reference profile from perfume name
========================= */
const RefSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "for_whom",
    "season",
    "type",
    "note_terms",
    "include_terms",
    "exclude_terms",
    "confidence",
  ],
  properties: {
    for_whom: {
      anyOf: [
        { type: "string", enum: ["жіночий", "чоловічий", "унісекс"] },
        { type: "null" },
      ],
    },
    season: { type: "array", items: { type: "string" }, maxItems: 6 },
    type: { type: "array", items: { type: "string" }, maxItems: 6 },
    note_terms: { type: "array", items: { type: "string" }, maxItems: 18 },
    include_terms: { type: "array", items: { type: "string" }, maxItems: 18 },
    exclude_terms: { type: "array", items: { type: "string" }, maxItems: 18 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

async function inferReferenceProfile(perfumeNameText) {
  const sys = `
Ти — парфумерний аналітик.
Користувач дав назву аромату. Сформуй ПРИБЛИЗНИЙ профіль для пошуку аналогів у базі.

ВАЖЛИВО:
- Якщо не впевнений — став confidence низько (0.2-0.5) і не вигадуй детально.
- note_terms/include_terms мають містити терміни, які реально можуть бути в описі/нотах в БД (укр/анг).
- Поверни ТІЛЬКИ JSON за схемою.
`.trim();

  const obj = await chatJSONSchema(
    sys,
    String(perfumeNameText || "").slice(0, 600),
    { name: "infer_reference_profile", schema: RefSchema, temperature: 0.2 },
  );

  const g = detectGenderHeuristic(perfumeNameText);

  const out = {
    for_whom: (g || obj.for_whom) ?? null,
    season: uniq(obj.season, 6),
    type: uniq(obj.type, 6),
    note_terms: uniq(obj.note_terms, 18),
    include_terms: uniq(obj.include_terms, 18),
    exclude_terms: uniq(obj.exclude_terms, 18),
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0.4,
  };

  // always add tokens from title to avoid empty profile
  out.include_terms = uniq(
    expandMultilingualTerms([
      ...out.include_terms,
      ...extractMeaningfulTokens(perfumeNameText, { max: 10 }),
    ]),
    18,
  );

  // multilingual expansions for ref-profile too
  out.note_terms = uniq(expandMultilingualTerms(out.note_terms), 18);
  out.season = uniq(expandMultilingualTerms(out.season), 6);
  out.type = uniq(expandMultilingualTerms(out.type), 6);

  return out;
}

/* =========================
   2) Retrieval from DB (no DB changes)
========================= */
function selectSQL() {
  return `
    SELECT id, photo, name, type, for_whom, season, occasion, age, notes, keywords, version, description
    FROM perfumes
  `;
}

function rowText(row) {
  return norm(
    [
      row.name,
      row.type,
      row.for_whom,
      row.season,
      row.occasion,
      row.age,
      row.notes,
      row.keywords,
      row.version,
      row.description,
    ].join(" | "),
  );
}

function buildCandidateSQLFromOntology(q) {
  const wh = [];
  const params = [];

  const terms = [
    ...(q.note_terms || []),
    ...(q.include_terms || []),
    ...(q.season || []),
    ...(q.type || []),
  ].slice(0, 40);

  const likeAny = (field, term) => {
    const vars = termVariants(term);
    const ors = vars.map(() => `COALESCE(${field},'') LIKE ?`).join(" OR ");
    wh.push(`(${ors})`);
    for (const v of vars) params.push(`%${v}%`);
  };

  for (const t of terms) {
    likeAny("keywords", t);
    likeAny("notes", t);
    likeAny("name", t);
    likeAny("description", t);
  }

  const where = wh.length ? `WHERE ${wh.join(" OR ")}` : "";
  const sql = `
    ${selectSQL()}
    ${where}
    LIMIT 900
  `;
  return { sql, params };
}

function normalizeRowGender(rowForWhomRaw) {
  const fw = norm(rowForWhomRaw);
  const isMale =
    fw.includes("чолов") || fw.includes("male") || fw.includes("men");
  const isFemale =
    fw.includes("жін") || fw.includes("female") || fw.includes("women");
  const isUnisex = fw.includes("унісекс") || fw.includes("unisex");
  return { isMale, isFemale, isUnisex, raw: fw };
}

/**
 * ✅ Gender is hard filter:
 * - "чоловічий" -> male OR unisex
 * - "жіночий" -> female OR unisex
 * - "унісекс" -> only unisex
 */
function genderAllowed(rowForWhomRaw, queryForWhom) {
  if (!queryForWhom) return true;
  const g = normalizeRowGender(rowForWhomRaw);

  if (queryForWhom === "унісекс") return g.isUnisex;
  if (queryForWhom === "чоловічий") return g.isMale || g.isUnisex;
  if (queryForWhom === "жіночий") return g.isFemale || g.isUnisex;
  return true;
}

function scoreCandidateByKeywords(row, ontology) {
  const hayKeywords = norm(row.keywords);
  const hayNotes = norm(row.notes);
  const hayName = norm(row.name);
  const hayDesc = norm(row.description);

  let score = 0;

  const terms = [
    ...(ontology.note_terms || []),
    ...(ontology.include_terms || []),
    ...(ontology.season || []),
    ...(ontology.type || []),
  ].slice(0, 50);

  for (const raw of terms) {
    const t = norm(raw);
    if (!t) continue;

    const short = t.length <= 3;

    const kwHit = short ? hasWholeWord(hayKeywords, t) : hayKeywords.includes(t);
    const noteHit = short ? hasWholeWord(hayNotes, t) : hayNotes.includes(t);
    const nameHit = hayName.includes(t);
    const descHit = short ? hasWholeWord(hayDesc, t) : hayDesc.includes(t);

    if (kwHit) score += 8;
    if (noteHit) score += 5;
    if (nameHit) score += 3;
    if (descHit) score += 1;

    if (kwHit && noteHit) score += 3;
  }

  // if query has note_terms but row notes empty -> penalty
  if ((ontology.note_terms || []).length && !hayNotes) score -= 6;

  // small bonus for exact gender match
  if (ontology.for_whom) {
    const g = normalizeRowGender(row.for_whom);
    if (ontology.for_whom === "чоловічий" && g.isMale && !g.isFemale) score += 6;
    if (ontology.for_whom === "жіночий" && g.isFemale && !g.isMale) score += 6;
    if (ontology.for_whom === "унісекс" && g.isUnisex) score += 6;
  }

  return score;
}

/**
 * ✅ IMPORTANT FIX:
 * - If query has terms and SQL found nothing => return [] (no fallback pool)
 * - fallback pool only for truly empty/general query
 */
function retrieveCandidates(q, { limitCandidates = 80 } = {}) {
  let rows = [];
  try {
    const { sql, params } = buildCandidateSQLFromOntology(q);
    rows = db.prepare(sql).all(...params);
  } catch {
    rows = [];
  }

  const termsCount =
    (q.note_terms || []).length +
    (q.include_terms || []).length +
    (q.season || []).length +
    (q.type || []).length;

  if (!rows.length && termsCount > 0) return [];

  if (!rows.length) {
    rows = db.prepare(`${selectSQL()} LIMIT 1800`).all();
  }

  const exclude = q.exclude_terms || [];
  const noteTerms = q.note_terms || [];

  const scored = rows
    .filter((r) => genderAllowed(r.for_whom, q.for_whom))
    .map((r) => {
      const hayAll = rowText(r);

      // exclude terms
      for (const ex of exclude) {
        const e = norm(ex);
        if (!e) continue;
        if (e.length <= 3) {
          if (hasWholeWord(hayAll, e)) return null;
        } else {
          if (hayAll.includes(e)) return null;
        }
      }

      // if note_terms exist -> require at least one match anywhere
      if (noteTerms.length) {
        let ok = false;
        for (const tt of noteTerms) {
          const t = norm(tt);
          if (!t) continue;
          if (t.length <= 3) {
            if (hasWholeWord(hayAll, t)) {
              ok = true;
              break;
            }
          } else if (hayAll.includes(t)) {
            ok = true;
            break;
          }
        }
        if (!ok) return null;
      }

      const score = scoreCandidateByKeywords(r, q);
      return { r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limitCandidates, 80))
    .map((x) => x.r);

  return scored;
}

/* =========================
   Reasons helper (fallback if LLM doesn't provide)
========================= */
function buildReasonFromOntology(perfume, ontology) {
  const hits = [];

  const hay = norm(
    [
      perfume?.name,
      perfume?.type,
      perfume?.for_whom,
      perfume?.season,
      perfume?.notes,
      perfume?.keywords,
      perfume?.description,
    ].join(" | "),
  );

  const terms = [
    ...(ontology?.note_terms || []),
    ...(ontology?.include_terms || []),
    ...(ontology?.season || []),
    ...(ontology?.type || []),
  ].slice(0, 24);

  for (const tRaw of terms) {
    const t = norm(tRaw);
    if (!t) continue;
    const hit = t.length <= 3 ? hasWholeWord(hay, t) : hay.includes(t);
    if (hit) hits.push(tRaw);
    if (hits.length >= 4) break;
  }

  if (ontology?.for_whom) hits.push(`стать: ${ontology.for_whom}`);

  if (!hits.length) return "";
  return `Підійшло по запиту: ${[...new Set(hits)].slice(0, 5).join(", ")}`;
}

/* =========================
   3) Rerank top-3 (schema-safe)
========================= */
const RerankSchema = {
  type: "object",
  additionalProperties: false,
  required: ["picked_ids", "reasons"],
  properties: {
    picked_ids: { type: "array", items: { type: "number" }, maxItems: 3 },
    reasons: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "reason"],
        properties: {
          id: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
  },
};

function compactCandidate(r) {
  return {
    id: Number(r.id),
    name: String(r.name || ""),
    for_whom: String(r.for_whom || ""),
    season: String(r.season || ""),
    type: String(r.type || ""),
    notes: String(r.notes || "").slice(0, 260),
    keywords: String(r.keywords || "").slice(0, 260),
    description: String(r.description || "").slice(0, 260),
  };
}

async function rerankTop3(userText, ontology, candidates) {
  const sys = `
Ти — консультант-продавець парфумерії.
Тобі дано: user_text, ontology (структура запиту), і список кандидатів з БД.
Вибери 3 найбільш релевантні кандидати.

Правила:
- Обирай ТІЛЬКИ зі списку candidate_list (НЕ вигадуй).
- Стать (for_whom) — критично важлива.
- Враховуй note_terms/include_terms/season/type/exclude_terms.
- reasons: 1 коротке речення, тільки з даних кандидата.
Поверни ТІЛЬКИ JSON.
`.trim();

  const payload = {
    user_text: String(userText || ""),
    ontology,
    candidate_list: candidates.map(compactCandidate),
  };

  const obj = await chatJSONSchema(
    sys,
    JSON.stringify(payload).slice(0, 20000),
    { name: "rerank_top3", schema: RerankSchema, temperature: 0.2 },
  );

  const allowed = new Set(candidates.map((c) => Number(c.id)));

  let picked = (obj?.picked_ids || [])
    .map(Number)
    .filter((id) => allowed.has(id));

  picked = [...new Set(picked)].slice(0, 3);

  // guarantee 3
  if (picked.length < 3) {
    for (const c of candidates) {
      const id = Number(c.id);
      if (!picked.includes(id)) {
        picked.push(id);
        if (picked.length === 3) break;
      }
    }
  }

  if (!picked.length) {
    picked = candidates.slice(0, 3).map((c) => Number(c.id));
  }

  const reasons_by_id = {};
  for (const rr of obj?.reasons || []) {
    const id = Number(rr?.id);
    const reason = String(rr?.reason || "").trim();
    if (allowed.has(id) && reason) reasons_by_id[String(id)] = reason;
  }

  return { picked_ids: picked.slice(0, 3), reasons_by_id };
}

/* =========================
   Detect "looks like perfume name"
========================= */
function looksLikePerfumeName(userText) {
  const t = String(userText || "").trim();
  if (t.length < 4) return false;
  if (t.includes(",")) return false;

  const low = norm(t);
  if (
    low.includes("чолов") ||
    low.includes("жін") ||
    low.includes("унісекс") ||
    low.includes("зима") ||
    low.includes("літо") ||
    low.includes("весна") ||
    low.includes("осін") ||
    low.includes("ноти") ||
    low.includes("без ")
  )
    return false;

  const words = low.split(" ").filter(Boolean);
  return words.length >= 2;
}

/* =========================
   Full pipeline (TOP-3)
========================= */
async function smartSearchPipeline(
  userText,
  { limitCandidates = 120, forceForWhom = null } = {},
) {
  let ontology = await understandQuery(userText);

  // allow external forced gender (from flow)
  if (forceForWhom && !ontology.for_whom) ontology.for_whom = forceForWhom;

  // reference profile if text looks like perfume name
  if (looksLikePerfumeName(userText) && ontology.intent !== "find") {
    const ref = await inferReferenceProfile(userText);

    if (!ontology.for_whom && ref.for_whom) ontology.for_whom = ref.for_whom;

    ontology.note_terms = uniq(
      expandMultilingualTerms([...ontology.note_terms, ...ref.note_terms]),
      24,
    );
    ontology.include_terms = uniq(
      expandMultilingualTerms([...ontology.include_terms, ...ref.include_terms]),
      24,
    );
    ontology.exclude_terms = uniq(
      expandMultilingualTerms([...ontology.exclude_terms, ...ref.exclude_terms]),
      24,
    );
    ontology.season = uniq(
      expandMultilingualTerms([...ontology.season, ...ref.season]),
      8,
    );
    ontology.type = uniq(
      expandMultilingualTerms([...ontology.type, ...ref.type]),
      8,
    );

    ontology.min_confidence = Math.max(
      ontology.min_confidence || 0.4,
      ref.confidence || 0.4,
    );
  }

  const candidates = retrieveCandidates(ontology, { limitCandidates });

  if (!candidates.length) {
    return { ontology, candidates_count: 0, topItems: [], reasons_by_id: {} };
  }

  const rerank = await rerankTop3(userText, ontology, candidates);

  const byId = new Map(candidates.map((c) => [Number(c.id), c]));
  const topItems = (rerank.picked_ids || [])
    .map((id) => byId.get(Number(id)))
    .filter(Boolean)
    .slice(0, 3);

  const reasons_by_id = { ...(rerank.reasons_by_id || {}) };
  for (const p of topItems) {
    const id = String(p.id);
    if (!reasons_by_id[id]) {
      const r = buildReasonFromOntology(p, ontology);
      if (r) reasons_by_id[id] = r;
    }
  }

  return {
    ontology,
    candidates_count: candidates.length,
    topItems,
    reasons_by_id,
  };
}

/* =========================
   TOP-N pipeline
========================= */
async function smartSearchTopN(
  userText,
  topN,
  { limitCandidates = 160, forceForWhom = null } = {},
) {
  let ontology = await understandQuery(userText);

  if (forceForWhom && !ontology.for_whom) ontology.for_whom = forceForWhom;

  if (looksLikePerfumeName(userText)) {
    const ref = await inferReferenceProfile(userText);
    if (!ontology.for_whom && ref.for_whom) ontology.for_whom = ref.for_whom;

    ontology.note_terms = uniq(
      expandMultilingualTerms([...ontology.note_terms, ...ref.note_terms]),
      24,
    );
    ontology.include_terms = uniq(
      expandMultilingualTerms([...ontology.include_terms, ...ref.include_terms]),
      24,
    );
    ontology.season = uniq(
      expandMultilingualTerms([...ontology.season, ...ref.season]),
      8,
    );
    ontology.type = uniq(
      expandMultilingualTerms([...ontology.type, ...ref.type]),
      8,
    );
  }

  const candidates = retrieveCandidates(ontology, { limitCandidates });

  if (!candidates.length) {
    return { ontology, candidates_count: 0, topItems: [], reasons_by_id: {} };
  }

  const sys = `
Ти — професійний консультант парфумерії.
Обери ТОП-${topN} найбільш релевантних ароматів зі списку.
НЕ вигадуй нові.
Стать (for_whom) — критично важлива.
Поверни тільки JSON.
`.trim();

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["picked_ids"],
    properties: {
      picked_ids: {
        type: "array",
        items: { type: "number" },
        maxItems: topN,
      },
    },
  };

  const payload = {
    user_text: String(userText || ""),
    ontology,
    candidate_list: candidates.slice(0, 80).map((c) => ({
      id: Number(c.id),
      name: String(c.name || ""),
      for_whom: String(c.for_whom || ""),
      season: String(c.season || ""),
      type: String(c.type || ""),
      notes: String(c.notes || "").slice(0, 260),
      keywords: String(c.keywords || "").slice(0, 260),
    })),
  };

  const obj = await chatJSONSchema(
    sys,
    JSON.stringify(payload).slice(0, 20000),
    { name: "rerank_topN", schema, temperature: 0.2 },
  );

  const allowed = new Set(candidates.map((c) => Number(c.id)));

  let picked = (obj?.picked_ids || [])
    .map(Number)
    .filter((id) => allowed.has(id));

  picked = [...new Set(picked)].slice(0, topN);

  if (picked.length < topN) {
    for (const c of candidates) {
      const id = Number(c.id);
      if (!picked.includes(id)) {
        picked.push(id);
        if (picked.length === topN) break;
      }
    }
  }

  const byId = new Map(candidates.map((c) => [Number(c.id), c]));
  const topItems = picked
    .map((id) => byId.get(Number(id)))
    .filter(Boolean)
    .slice(0, topN);

  const reasons_by_id = {};
  for (const p of topItems) {
    const r = buildReasonFromOntology(p, ontology);
    if (r) reasons_by_id[String(p.id)] = r;
  }

  return {
    ontology,
    candidates_count: candidates.length,
    topItems,
    reasons_by_id,
  };
}

module.exports = {
  understandQuery,
  inferReferenceProfile,
  retrieveCandidates,
  rerankTop3,
  smartSearchPipeline,
  smartSearchTopN,
  detectForWhomFromText,
};