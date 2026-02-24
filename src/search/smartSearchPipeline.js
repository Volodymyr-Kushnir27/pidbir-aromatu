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
   Token-boundary match
   (щоб "ром" не матчило "ромашка"/"аромат")
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

function detectForWhomFromText(text) {
  const t = String(text || "").toLowerCase();

  // UA/RU
  if (/(унісекс|унисекс|unisex)/i.test(t)) return "унісекс";
  if (/(чол(овічі|овічий)?|муж(ской|ские)?|men|male)/i.test(t)) return "чоловіки";
  if (/(жін(очі|очий)?|жен(ский|ские)?|women|female)/i.test(t)) return "жінки";

  return null;
}

/* =========================
   Heuristics: detect gender
========================= */
function detectGenderHeuristic(text) {
  const t = norm(text);

  // ua/ru + частково en
  if (/(^|[\s,;])унісекс|unisex([\s,;]|$)/i.test(t)) return "унісекс";
  if (/(^|[\s,;])(чолов|муж|men|man)([\s,;]|$)/i.test(t)) return "чоловічий";
  if (/(^|[\s,;])(жін|жен|women|woman|female)([\s,;]|$)/i.test(t)) return "жіночий";

  return null;
}

/* =========================
   Heuristics: tokens from user text
   (щоб не було пустого ontology -> однакові результати)
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
    // відсікаємо чисті числа/коди
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

  // heuristic gender overrides (найважливіше)
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

  // якщо LLM повернув майже пусто — добиваємо термами з тексту,
  // інакше ти завжди будеш отримувати один і той самий топ з перших рядків БД
  const termsCount =
    out.note_terms.length +
    out.include_terms.length +
    out.season.length +
    out.type.length;

  if (termsCount === 0) {
    out.include_terms = uniq(
      [...out.include_terms, ...extractMeaningfulTokens(userText, { max: 10 })],
      24,
    );
    out.search_mode = "fallback";
    out.min_confidence = Math.min(out.min_confidence, 0.4);
  }

  return out;
}

/* =========================
   1b) Reference profile from perfume name
   (для "схоже на X", коли X не з БД)
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

  // завжди додамо токени з назви, щоб не було пусто
  out.include_terms = uniq(
    [...out.include_terms, ...extractMeaningfulTokens(perfumeNameText, { max: 10 })],
    18,
  );

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
  const isMale = fw.includes("чолов") || fw.includes("male") || fw.includes("men");
  const isFemale = fw.includes("жін") || fw.includes("female") || fw.includes("women");
  const isUnisex = fw.includes("унісекс") || fw.includes("unisex");
  return { isMale, isFemale, isUnisex, raw: fw };
}

/**
 * ✅ СТАТЬ — найсильніший фільтр
 * Якщо в запиті "чоловічий" -> дозволяємо тільки male або unisex.
 * Якщо "жіночий" -> female або unisex.
 * Якщо "унісекс" -> тільки unisex.
 */
function genderAllowed(rowForWhomRaw, queryForWhom) {
  if (!queryForWhom) return true;
  const g = normalizeRowGender(rowForWhomRaw);

  if (queryForWhom === "унісекс") return g.isUnisex;
  if (queryForWhom === "чоловічий") return g.isMale || g.isUnisex;
  if (queryForWhom === "жіночий") return g.isFemale || g.isUnisex;
  return true;
}

/**
 * 🔥 Scoring
 * Підсилюємо keywords/notes, але додатково:
 * - якщо queryForWhom заданий і кандидат не підходить -> кандидата ВЖЕ відсікаємо (genderAllowed)
 * - якщо кандидат "точно чоловічий", а запит чоловічий -> маленький бонус
 */
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

  // якщо запит має note_terms, але в кандидата notes порожній — мінус
  if ((ontology.note_terms || []).length && !hayNotes) score -= 6;

  // маленький бонус за точну стать
  if (ontology.for_whom) {
    const g = normalizeRowGender(row.for_whom);
    if (ontology.for_whom === "чоловічий" && g.isMale && !g.isFemale) score += 6;
    if (ontology.for_whom === "жіночий" && g.isFemale && !g.isMale) score += 6;
    if (ontology.for_whom === "унісекс" && g.isUnisex) score += 6;
  }

  return score;
}

function retrieveCandidates(q, { limitCandidates = 80 } = {}) {
  let rows = [];
  try {
    const { sql, params } = buildCandidateSQLFromOntology(q);
    rows = db.prepare(sql).all(...params);
  } catch {
    rows = [];
  }

  // fallback pool
  if (!rows.length) {
    rows = db.prepare(`${selectSQL()} LIMIT 1800`).all();
  }

  const exclude = q.exclude_terms || [];
  const noteTerms = q.note_terms || [];

  const scored = rows
    .filter((r) => genderAllowed(r.for_whom, q.for_whom)) // ✅ стать — жорстко
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

      // якщо є note_terms — хоча б 1 має бути знайдений
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
   3) Rerank top-3 (json_schema safe)
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

  const obj = await chatJSONSchema(sys, JSON.stringify(payload).slice(0, 20000), {
    name: "rerank_top3",
    schema: RerankSchema,
    temperature: 0.2,
  });

  const allowed = new Set(candidates.map((c) => Number(c.id)));

  let picked = (obj.picked_ids || [])
    .map(Number)
    .filter((id) => allowed.has(id));

  picked = [...new Set(picked)].slice(0, 3);

  const reasons_by_id = {};
  const reasonsArr = Array.isArray(obj.reasons) ? obj.reasons : [];
  for (const r of reasonsArr) {
    const id = Number(r?.id);
    const reason = String(r?.reason || "").trim();
    if (allowed.has(id) && reason) reasons_by_id[String(id)] = reason;
  }

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

  return { picked_ids: picked.slice(0, 3), reasons_by_id };
}

/* =========================
   Detect "looks like perfume name"
   (без явних фільтрів, без ком, без "чоловічі/зима/ноти" тощо)
========================= */
function looksLikePerfumeName(userText) {
  const t = String(userText || "").trim();
  if (t.length < 4) return false;

  // якщо є коми/перерахування — це вже скоріше фільтри
  if (t.includes(",")) return false;

  // якщо явно є filter-слова
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

  // якщо схоже на назву (2+ слів або з апострофом/брендом)
  const words = low.split(" ").filter(Boolean);
  return words.length >= 2;
}

/* =========================
   Full pipeline
========================= */
async function smartSearchPipeline(userText, { limitCandidates = 120 } = {}) {
  // 1) базове розуміння запиту
  let ontology = await understandQuery(userText);

  // 2) якщо це виглядає як назва аромату — зробимо reference профіль і підмішаємо терми
  if (looksLikePerfumeName(userText) && ontology.intent !== "find") {
    const ref = await inferReferenceProfile(userText);

    // якщо користувач НЕ задав стать явно — беремо з ref
    if (!ontology.for_whom && ref.for_whom) ontology.for_whom = ref.for_whom;

    ontology.note_terms = uniq([...ontology.note_terms, ...ref.note_terms], 24);
    ontology.include_terms = uniq(
      [...ontology.include_terms, ...ref.include_terms],
      24,
    );
    ontology.exclude_terms = uniq(
      [...ontology.exclude_terms, ...ref.exclude_terms],
      24,
    );
    ontology.season = uniq([...ontology.season, ...ref.season], 8);
    ontology.type = uniq([...ontology.type, ...ref.type], 8);

    // якщо ref більш впевнений — піднімаємо min_confidence
    ontology.min_confidence = Math.max(
      ontology.min_confidence || 0.4,
      ref.confidence || 0.4,
    );
  }

  // 3) retrieval
  const candidates = retrieveCandidates(ontology, { limitCandidates });

  if (!candidates.length) {
    return {
      ontology,
      candidates_count: 0,
      topItems: [],
      reasons_by_id: {},
    };
  }

  // 4) rerank top-3
  const rerank = await rerankTop3(userText, ontology, candidates);

  const byId = new Map(candidates.map((c) => [Number(c.id), c]));
  const topItems = (rerank.picked_ids || [])
    .map((id) => byId.get(Number(id)))
    .filter(Boolean)
    .slice(0, 3);

  return {
    ontology,
    candidates_count: candidates.length,
    topItems,
    reasons_by_id: rerank.reasons_by_id || {},
  };
}

/* =========================
   TOP-N PIPELINE
========================= */
async function smartSearchTopN(userText, topN, { limitCandidates = 160 } = {}) {
  let ontology = await understandQuery(userText);

  // якщо це виглядає як назва — зробимо профіль
  if (looksLikePerfumeName(userText)) {
    const ref = await inferReferenceProfile(userText);
    if (!ontology.for_whom && ref.for_whom) ontology.for_whom = ref.for_whom;
    ontology.note_terms = uniq([...ontology.note_terms, ...ref.note_terms], 24);
    ontology.include_terms = uniq(
      [...ontology.include_terms, ...ref.include_terms],
      24,
    );
    ontology.season = uniq([...ontology.season, ...ref.season], 8);
    ontology.type = uniq([...ontology.type, ...ref.type], 8);
  }

  const candidates = retrieveCandidates(ontology, { limitCandidates });

  if (!candidates.length) {
    return { ontology, candidates_count: 0, topItems: [], reasons_by_id: {} };
  }

  // rerank TOP-N
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

  let picked = (obj?.picked_ids || []).map(Number).filter((id) => allowed.has(id));
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
  const topItems = picked.map((id) => byId.get(Number(id))).filter(Boolean).slice(0, topN);

  return {
    ontology,
    candidates_count: candidates.length,
    topItems,
    reasons_by_id: {},
  };
}

module.exports = {
  understandQuery,
  retrieveCandidates,
  rerankTop3,
  smartSearchPipeline,
  smartSearchTopN,
  detectForWhomFromText, // ✅ ДОДАТИ
};