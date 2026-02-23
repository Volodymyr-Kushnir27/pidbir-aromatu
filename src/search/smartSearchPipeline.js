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
   🔥 Gender detection (rule-based)
   ВИКОРИСТОВУЄМО СКРІЗЬ ЯК "forceForWhom"
========================= */
function detectForWhomFromText(text) {
  const t = ` ${norm(text)} `;

  // explicit unisex first
  if (/(^|\s)(унісекс|unisex)(\s|$)/i.test(t)) return "унісекс";

  // explicit UA
  if (/(^|\s)(чоловіч(ий|і)|для чоловік(ів|а)|чоловічі)(\s|$)/i.test(t)) return "чоловічий";
  if (/(^|\s)(жіноч(ий|і)|для жін(ок|ки)|жіночі)(\s|$)/i.test(t)) return "жіночий";

  // EN/FR patterns often used in product names
  if (/(^|\s)(pour homme|for men|mens|men|man|male|him)(\s|$)/i.test(t)) return "чоловічий";
  if (/(^|\s)(pour femme|for women|womens|women|woman|female|her|lady)(\s|$)/i.test(t)) return "жіночий";

  // “Le Male” / “La Femme” etc
  if (/(^|\s)le male(\s|$)/i.test(t)) return "чоловічий";
  if (/(^|\s)la femme(\s|$)/i.test(t)) return "жіночий";

  return null;
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

async function understandQuery(userText, { forceForWhom = null } = {}) {
  const sys = `
Ти — Query Understanding для пошуку парфумів у SQLite.
Поверни ТІЛЬКИ JSON за схемою. НЕ вигадуй парфуми.

ВАЖЛИВО:
- Якщо в запиті явно є стать (чоловічі/жіночі/унісекс) — постав for_whom.
- exclude_terms заповнюй, якщо користувач каже "без ..."

Онтологія/синоніми:
- "сигарета" -> ["тютюн","дим","сигарета","tobacco","smoke"], category "tobacco_smoke"
- "алкогольні ноти" -> ["ром","віскі","коньяк","бренді","джин","лікер","rum","whisky","cognac","brandy","gin","liqueur"], category "boozy"
- "зелений чай" -> ["зелений чай","tea","green tea"]
- "ромашка" -> ["ромашка","chamomile"]
- "груша" -> ["груша","pear"]

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

  // ✅ FORCE OVERRIDE: стать завжди головна
  const forced = forceForWhom || null;

  return {
    intent: obj.intent || "unknown",
    note_terms: uniq(obj.note_terms, 24),
    note_categories: uniq(obj.note_categories, 12),
    include_terms: uniq(obj.include_terms, 24),
    exclude_terms: uniq(obj.exclude_terms, 24),
    for_whom: forced || (obj.for_whom ?? null),
    season: uniq(obj.season, 8),
    type: uniq(obj.type, 8),
    search_mode: obj.search_mode || "hybrid",
    min_confidence:
      typeof obj.min_confidence === "number" ? obj.min_confidence : 0.6,
  };
}

/* =========================
   2) Retrieval from DB
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

function genderAllowed(rowForWhomRaw, queryForWhom) {
  // якщо користувач не задав стать — не фільтруємо
  if (!queryForWhom) return true;

  const fw = norm(rowForWhomRaw);
  const isMale = fw.includes("чолов");
  const isFemale = fw.includes("жін");
  const isUnisex = fw.includes("унісекс") || fw.includes("unisex");

  // ✅ СТРОГО:
  // - чоловічий -> чоловічі + унісекс
  // - жіночий   -> жіночі + унісекс
  // - унісекс   -> тільки унісекс
  if (queryForWhom === "унісекс") return isUnisex;
  if (queryForWhom === "чоловічий") return isMale || isUnisex;
  if (queryForWhom === "жіночий") return isFemale || isUnisex;

  return true;
}

/**
 * score ваги:
 * - keywords: 8
 * - notes:    5
 * - name:     3
 * - desc:     1
 * + bonus якщо терм і в keywords, і в notes -> +3
 *
 * ✅ ДОДАЄМО ВЕЛИКИЙ БОНУС ЗА СТАТЬ (щоб унісекс ішов після "правильних")
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

  if ((ontology.note_terms || []).length && !hayNotes) score -= 6;

  // ✅ БОНУС ЗА СТАТЬ (великий)
  if (ontology.for_whom) {
    const fw = norm(row.for_whom);
    const isMale = fw.includes("чолов");
    const isFemale = fw.includes("жін");
    const isUnisex = fw.includes("унісекс") || fw.includes("unisex");

    if (ontology.for_whom === "чоловічий") {
      if (isMale) score += 50;
      else if (isUnisex) score += 15;
    } else if (ontology.for_whom === "жіночий") {
      if (isFemale) score += 50;
      else if (isUnisex) score += 15;
    } else if (ontology.for_whom === "унісекс") {
      if (isUnisex) score += 50;
    }
  }

  return score;
}

function retrieveCandidates(q, { limitCandidates = 60 } = {}) {
  let rows = [];
  try {
    const { sql, params } = buildCandidateSQLFromOntology(q);
    rows = db.prepare(sql).all(...params);
  } catch {
    rows = [];
  }

  if (!rows.length) {
    rows = db.prepare(`${selectSQL()} LIMIT 1800`).all();
  }

  const exclude = q.exclude_terms || [];
  const noteTerms = q.note_terms || [];

  const scored = rows
    .filter((r) => genderAllowed(r.for_whom, q.for_whom)) // ✅ СТРОГИЙ ФІЛЬТР
    .map((r) => {
      const hayAll = rowText(r);

      for (const ex of exclude) {
        const e = norm(ex);
        if (!e) continue;
        if (e.length <= 3) {
          if (hasWholeWord(hayAll, e)) return null;
        } else {
          if (hayAll.includes(e)) return null;
        }
      }

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
    .slice(0, Math.max(limitCandidates, 60))
    .map((x) => x.r);

  return scored;
}

/* =========================
   3) Rerank top-3
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
Вибери ТОП-3 зі списку.

ЗАЛІЗНЕ ПРАВИЛО СТАТІ:
- Якщо ontology.for_whom="чоловічий" -> ОБИРАЙ ТІЛЬКИ чоловічі або унісекс.
- Якщо "жіночий" -> ТІЛЬКИ жіночі або унісекс.
- Якщо "унісекс" -> ТІЛЬКИ унісекс.

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

  if (picked.length < 3) {
    for (const c of candidates) {
      const id = Number(c.id);
      if (!picked.includes(id)) picked.push(id);
      if (picked.length === 3) break;
    }
  }

  if (!picked.length) {
    picked = candidates.slice(0, 3).map((c) => Number(c.id));
  }

  return { picked_ids: picked.slice(0, 3), reasons_by_id };
}

/* =========================
   Full pipeline
========================= */
async function smartSearchPipeline(userText, { limitCandidates = 60, forceForWhom = null } = {}) {
  const ontology = await understandQuery(userText, { forceForWhom });
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

  return {
    ontology,
    candidates_count: candidates.length,
    topItems,
    reasons_by_id: rerank.reasons_by_id || {},
  };
}

/* =========================
   TOP-N pipeline
========================= */
async function smartSearchTopN(userText, topN, { limitCandidates = 120, forceForWhom = null } = {}) {
  const ontology = await understandQuery(userText, { forceForWhom });
  const candidates = retrieveCandidates(ontology, { limitCandidates });

  if (!candidates.length) {
    return { ontology, candidates_count: 0, topItems: [], reasons_by_id: {} };
  }

  const sys = `
Ти — професійний консультант парфумерії.
Обери ТОП-${topN} зі списку.

ЗАЛІЗНЕ ПРАВИЛО СТАТІ:
- Якщо ontology.for_whom="чоловічий" -> ОБИРАЙ ТІЛЬКИ чоловічі або унісекс.
- Якщо "жіночий" -> ТІЛЬКИ жіночі або унісекс.
- Якщо "унісекс" -> ТІЛЬКИ унісекс.

Поверни тільки JSON.
`.trim();

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["picked_ids"],
    properties: {
      picked_ids: { type: "array", items: { type: "number" }, maxItems: topN },
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

  const obj = await chatJSONSchema(sys, JSON.stringify(payload).slice(0, 20000), {
    name: "rerank_topN",
    schema,
    temperature: 0.2,
  });

  const allowed = new Set(candidates.map((c) => Number(c.id)));

  let picked = (obj?.picked_ids || [])
    .map(Number)
    .filter((id) => allowed.has(id));

  picked = [...new Set(picked)].slice(0, topN);

  if (picked.length < topN) {
    for (const c of candidates) {
      const id = Number(c.id);
      if (!picked.includes(id)) picked.push(id);
      if (picked.length === topN) break;
    }
  }

  const byId = new Map(candidates.map((c) => [Number(c.id), c]));
  const topItems = picked.map((id) => byId.get(Number(id))).filter(Boolean).slice(0, topN);

  return { ontology, candidates_count: candidates.length, topItems, reasons_by_id: {} };
}

module.exports = {
  detectForWhomFromText,
  understandQuery,
  retrieveCandidates,
  rerankTop3,
  smartSearchPipeline,
  smartSearchTopN,
};