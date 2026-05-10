const { getAllPerfumes } = require("./catalogRepo");

/**
 * FINAL fast direct DB search before AI.
 *
 * Rules:
 * - gender / intent words are removed from the name query;
 * - direct name/version/keywords search is always fast;
 * - no Levenshtein;
 * - apostrophes are separators: L'imperatrice -> l imperatrice;
 * - exact name/version/keywords has priority over notes/style.
 */

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(arr = []) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

function uniqById(items = []) {
  const seen = new Set();
  const out = [];

  for (const item of items || []) {
    const id = Number(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }

  return out;
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/[“”"«»]/g, " ")
    .replace(/&/g, " and ")
    .replace(/№/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INTENT_STOP_WORDS = new Set([
  "я", "мені", "мне", "меня", "хочу", "треба", "надо", "потрібно", "нужно",
  "підбери", "подбери", "знайди", "найди", "покажи", "дай", "порекомендуй",
  "схоже", "схожий", "схожа", "схожі", "похожий", "похожее", "похожие",
  "аналог", "аналоги", "аромат", "аромату", "ароматом", "аромати", "ароматів",
  "парфум", "парфуми", "парфумом", "парфюм", "парфюмом", "духи",
  "fragrance", "perfume", "на", "і", "и", "та", "або", "или", "or", "для", "for",
  "мене", "себе", "будь", "ласка", "будьласка",
]);

const GENDER_WORDS = new Set([
  "жіночі", "жіночий", "жіноче", "жіноча", "жінки", "жінок", "дівчини", "дівчат",
  "женские", "женский", "женская", "женское", "женщины", "женщин", "девушки", "девушек",
  "female", "women", "woman",
  "чоловічі", "чоловічий", "чоловіче", "чоловіча", "чоловіка", "чоловіків", "хлопця",
  "мужские", "мужской", "мужская", "мужское", "мужчины", "мужчин", "парня",
  "male", "men", "man",
  "унісекс", "унісексові", "унисекс", "unisex",
]);

function isNoiseToken(token) {
  const t = norm(token);
  return !t || INTENT_STOP_WORDS.has(t) || GENDER_WORDS.has(t);
}

function detectGenderFromQuery(text) {
  const tokens = norm(text).split(/\s+/).filter(Boolean);
  const joined = ` ${tokens.join(" ")} `;

  if (tokens.some((x) => ["унісекс", "унісексові", "унисекс", "unisex"].includes(x))) return "unisex";

  if (
    tokens.some((x) =>
      ["жіночі", "жіночий", "жіноче", "жіноча", "жінки", "жінок", "женские", "женский", "женская", "female", "women", "woman"].includes(x)
    ) ||
    joined.includes(" для жінки ") ||
    joined.includes(" для жінок ") ||
    joined.includes(" для женщины ") ||
    joined.includes(" для женщин ")
  ) {
    return "female";
  }

  if (
    tokens.some((x) =>
      ["чоловічі", "чоловічий", "чоловіче", "чоловіча", "чоловіка", "чоловіків", "мужские", "мужской", "мужская", "male", "men", "man"].includes(x)
    ) ||
    joined.includes(" для чоловіка ") ||
    joined.includes(" для чоловіків ") ||
    joined.includes(" для мужчины ") ||
    joined.includes(" для мужчин ")
  ) {
    return "male";
  }

  return null;
}



// DIRECT_BRAND_GENDER_FIX_V21
function getRowGender(item) {
  return item?.gender ?? item?.for_whom ?? item?.sex ?? item?.target_gender ?? "";
}

function normalizeDirectGenderValue(value) {
  const g = norm(String(value || ""));
  if (!g) return "unknown";

  const hasUnisex = g.includes("унісекс") || g.includes("унисекс") || /(^|\s)unisex(?=\s|$)/i.test(g);
  const hasFemale = g.includes("жіноч") || g.includes("женск") || /(^|\s)(female|woman|women)(?=\s|$)/i.test(g);
  const hasMale = g.includes("чолов") || g.includes("мужск") || /(^|\s)(male|man|men)(?=\s|$)/i.test(g);

  if (hasUnisex) return "unisex";
  if (hasFemale && hasMale) return "unisex";
  if (hasFemale) return "female";
  if (hasMale) return "male";
  return "unknown";
}

function directGenderAllowed(item, requestedGender) {
  const req = normalizeDirectGenderValue(requestedGender);
  const g = normalizeDirectGenderValue(getRowGender(item));
  if (!req || req === "unknown") return true;
  if (req === "male") return g === "male" || g === "unisex";
  if (req === "female") return g === "female" || g === "unisex";
  if (req === "unisex") return g === "unisex";
  return true;
}

function directGenderRank(item, requestedGender) {
  const req = normalizeDirectGenderValue(requestedGender);
  const g = normalizeDirectGenderValue(getRowGender(item));
  if (req === "male") {
    if (g === "male") return 0;
    if (g === "unisex") return 1;
    return 9;
  }
  if (req === "female") {
    if (g === "female") return 0;
    if (g === "unisex") return 1;
    return 9;
  }
  if (req === "unisex") {
    if (g === "unisex") return 0;
    return 9;
  }
  return 0;
}

function getAliases() {
  return [
    // DIRECT_BRAND_GENDER_FIX_V21: Chanel brand aliases
    ["шанель", "chanel"], ["шанел", "chanel"], ["шанель чоловічі", "chanel"],
    ["шанель мужские", "chanel"], ["chanel", "chanel"], ["chanell", "chanel"], ["chanelle", "chanel"],
    ["том форд", "tom ford"], ["томфорд", "tom ford"], ["том форт", "tom ford"],
    ["tom ford", "tom ford"], ["tomford", "tom ford"], ["tf", "tom ford"],

    ["пако карабан", "paco rabanne"], ["пако рабан", "paco rabanne"],
    ["пако рабане", "paco rabanne"], ["пако рабанне", "paco rabanne"],
    ["пако рабани", "paco rabanne"], ["пако рабані", "paco rabanne"],
    ["paco rabane", "paco rabanne"], ["paco rabanne", "paco rabanne"],
    ["рабан", "rabanne"], ["рабане", "rabanne"], ["рабанне", "rabanne"],

    ["інвіктус", "invictus"], ["инвиктус", "invictus"], ["инвіктус", "invictus"],
    ["інвиктус", "invictus"], ["inviktus", "invictus"], ["invictus", "invictus"],

    ["крид", "creed"], ["крід", "creed"], ["cread", "creed"], ["creed", "creed"],

    ["d g", "dolce gabbana"], ["dg", "dolce gabbana"], ["d and g", "dolce gabbana"],
    ["dolce and gabbana", "dolce gabbana"], ["dolce gabbana", "dolce gabbana"],
    ["дольче габбана", "dolce gabbana"], ["дольче габана", "dolce gabbana"],
    ["дольче энд габбана", "dolce gabbana"], ["дольче енд габбана", "dolce gabbana"],
    ["дольче", "dolce"], ["габбана", "gabbana"], ["габана", "gabbana"],

    ["імператриця", "imperatrice"], ["императрица", "imperatrice"],
    ["імператриса", "imperatrice"], ["императриса", "imperatrice"],
    ["императриця", "imperatrice"], ["імператрица", "imperatrice"],
    ["l imperatrice", "imperatrice"], ["l'imperatrice", "imperatrice"],
    ["limperatrice", "imperatrice"], ["imperatrice", "imperatrice"],

    ["лайт блю", "light blue"], ["лайт блу", "light blue"], ["лаит блю", "light blue"],
    ["lite blue", "light blue"], ["блакитні", "blue"], ["блакитний", "blue"], ["голубые", "blue"],

    ["лакоста", "lacoste"], ["лакосте", "lacoste"], ["лакост", "lacoste"],
    ["ла кост", "lacoste"], ["lacost", "lacoste"], ["lakosta", "lacoste"],

    ["чорний опіум", "black opium"], ["черный опиум", "black opium"],
    ["блек опіум", "black opium"], ["блек опиум", "black opium"], ["black opium", "black opium"],

    ["гарна дівчинка стала поганою", "good girl gone bad"],
    ["хороша дівчинка стала поганою", "good girl gone bad"],
    ["хорошая девочка стала плохой", "good girl gone bad"],
    ["good girl gone bad", "good girl gone bad"],
    ["гуд герл гон бед", "good girl gone bad"], ["гуд гірл гон бед", "good girl gone bad"],
    ["дуже гарна дівчинка", "very good girl"], ["очень хорошая девочка", "very good girl"],
    ["very good girl", "very good girl"], ["вері гуд герл", "very good girl"],
    ["гарна дівчинка", "good girl"], ["хороша дівчинка", "good girl"],
    ["хорошая девочка", "good girl"], ["good girl", "good girl"],
    ["гуд герл", "good girl"], ["гуд гірл", "good girl"], ["гуд гьорл", "good girl"],

    ["габа", "gaba"], ["габа парфюм", "gaba perfume"], ["габа парфум", "gaba perfume"],
    ["гормон париж", "hormone paris"], ["хормон париж", "hormone paris"],
    ["hormon paris", "hormone paris"],
  ];
}

function applyCommonAliases(value) {
  let s = norm(value);
  const aliases = getAliases().sort((a, b) => norm(b[0]).length - norm(a[0]).length);

  for (const [from, to] of aliases) {
    const source = norm(from);
    if (!source) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(source)}(?=\\s|$)`, "gi");
    s = s.replace(re, `$1${norm(to)}`);
  }

  return norm(s);
}

function cleanDirectQuery(value) {
  const raw = norm(value);
  if (!raw) return "";

  const withoutNoise = raw
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((token) => !isNoiseToken(token))
    .join(" ");

  return applyCommonAliases(withoutNoise);
}

function tokenize(value) {
  return norm(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .filter((x) => !isNoiseToken(x));
}

function fieldTokens(value) {
  return applyCommonAliases(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function hasPhrase(field, phrase) {
  const f = applyCommonAliases(field);
  const p = applyCommonAliases(phrase);
  if (!f || !p) return false;
  const parts = p.split(/\s+/).map(escapeRegExp);
  const re = new RegExp(`(^|\\s)${parts.join("\\s+")}(?=\\s|$)`, "i");
  return re.test(f);
}

function tokenSoftMatch(queryToken, fieldToken) {
  const q = applyCommonAliases(queryToken);
  const f = applyCommonAliases(fieldToken);
  if (!q || !f) return false;
  if (q === f) return true;
  if (q.length >= 5 && f.length >= 5 && (q.startsWith(f) || f.startsWith(q))) return true;
  return false;
}

function countTokenMatches(queryTokens = [], fieldTokenList = []) {
  const matched = [];
  for (const q of queryTokens) {
    const hit = fieldTokenList.find((f) => tokenSoftMatch(q, f));
    if (hit) matched.push(q);
  }
  return unique(matched);
}

function scoreField(fieldValue, query, fieldWeight, fieldName) {
  const field = applyCommonAliases(fieldValue);
  const q = cleanDirectQuery(query);

  if (!field || !q) return { score: 0, reason: "", type: "" };

  const qTokens = tokenize(q);
  const fTokens = fieldTokens(field);
  if (!qTokens.length || !fTokens.length) return { score: 0, reason: "", type: "" };

  if (field === q) {
    return { score: 14000 + fieldWeight, reason: "100% збіг", type: "exact_full" };
  }

  if (q.includes(" ") && hasPhrase(field, q)) {
    return { score: 12500 + fieldWeight, reason: `точний збіг фрази: ${q}`, type: "exact_phrase" };
  }

  if (qTokens.length === 1 && fTokens.includes(qTokens[0])) {
    return { score: 10500 + fieldWeight, reason: `точний збіг слова: ${qTokens[0]}`, type: "exact_token" };
  }

  const exactOverlaps = qTokens.filter((token) => fTokens.includes(token));

  if (qTokens.length > 1 && exactOverlaps.length === qTokens.length) {
    return {
      score: 9200 + fieldWeight + exactOverlaps.length * 100,
      reason: `збіг усіх слів: ${exactOverlaps.join(", ")}`,
      type: "token_overlap",
    };
  }

  if (exactOverlaps.length >= 1 && ["назва", "версія", "ключові слова"].includes(fieldName)) {
    return {
      score: qTokens.length === 1 ? 7600 + fieldWeight : 5200 + fieldWeight + exactOverlaps.length * 80,
      reason: `частковий збіг: ${exactOverlaps.slice(0, 4).join(", ")}`,
      type: qTokens.length === 1 ? "important_partial_token" : "partial_token",
    };
  }

  const softOverlaps = countTokenMatches(qTokens, fTokens);
  if (softOverlaps.length === qTokens.length) {
    return {
      score: 7000 + fieldWeight + softOverlaps.length * 80,
      reason: `схожий збіг: ${softOverlaps.slice(0, 4).join(", ")}`,
      type: "soft_token",
    };
  }

  return { score: 0, reason: "", type: "" };
}

function scorePerfume(item, query) {
  const fields = [
    { label: "назва", value: item.name, weight: 1600 },
    { label: "версія", value: item.version, weight: 1550 },
    { label: "ключові слова", value: item.keywords, weight: 1200 },
    { label: "код", value: item.number_code, weight: 200 },
    { label: "коди", value: item.number_codes, weight: 180 },
  ];

  let best = { score: 0, reason: "", field: "", type: "" };

  for (const field of fields) {
    const scored = scoreField(field.value, query, field.weight, field.label);
    if (scored.score > best.score) {
      best = { score: scored.score, reason: scored.reason, field: field.label, type: scored.type };
    }
  }

  if (!best.score) return null;

  return {
    ...item,
    match_score: best.score,
    match_bucket: "direct_name_version_keyword",
    direct_match_type: best.type,
    direct_match_field: best.field,
    why_selected: [best.field ? `${best.reason} у полі "${best.field}"` : best.reason || "збіг у прямому пошуку"],
    _debug: {
      ...(item._debug || {}),
      directNameKeywordSearch: { score: best.score, field: best.field, type: best.type },
    },
  };
}

function buildPrefilterTerms(query) {
  const cleaned = cleanDirectQuery(query);
  const aliased = applyCommonAliases(cleaned);
  const terms = unique([cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased)]).filter((x) => x.length >= 2);
  return terms.slice(0, 12);
}

function termMatchesHaystack(term, haystack) {
  const t = applyCommonAliases(term);
  if (!t || t.length < 2) return false;

  if (hasPhrase(haystack, t)) return true;

  const tTokens = tokenize(t);
  if (!tTokens.length) return false;

  if (tTokens.length > 1) {
    return tTokens.every((token) => hasPhrase(haystack, token));
  }

  return hasPhrase(haystack, tTokens[0]);
}

function rowContainsAnyTerm(item, terms = []) {
  const haystack = [
    item.name,
    item.version,
    item.keywords,
    item.number_code,
    item.number_codes,
  ].filter(Boolean).join(" ");

  if (!haystack) return false;
  return terms.some((term) => termMatchesHaystack(term, haystack));
}

function searchByNameAndKeywords(query, options = {}) {
  const start = Date.now();

  const limit = Number(options.limit || 30);
  const minScore = Number(options.minScore || 1200);
  const scanLimit = Number(options.scanLimit || 1000);

  const cleanedQuery = cleanDirectQuery(query);
  if (!cleanedQuery || cleanedQuery.length < 2) return [];

  const requestedGender = options.gender || detectGenderFromQuery(query);
  const terms = buildPrefilterTerms(cleanedQuery);
  const allRows = getAllPerfumes(scanLimit);
  const genderRows = allRows.filter((item) => directGenderAllowed(item, requestedGender));
  const prefiltered = genderRows.filter((item) => rowContainsAnyTerm(item, terms));

  const scored = prefiltered
    .map((item) => {
      const candidates = unique([cleanedQuery, ...terms])
        .map((term) => scorePerfume(item, term))
        .filter(Boolean);

      if (!candidates.length) return null;
      candidates.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0));
      return candidates[0];
    })
    .filter(Boolean)
    .filter((item) => Number(item.match_score || 0) >= minScore)
    .sort((a, b) => {
      const genderDiff = directGenderRank(a, requestedGender) - directGenderRank(b, requestedGender);
      if (genderDiff !== 0) return genderDiff;

      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      const fieldPriority = { "назва": 1, "версія": 2, "ключові слова": 3, "код": 4, "коди": 5 };
      const af = fieldPriority[String(a.direct_match_field || "")] || 99;
      const bf = fieldPriority[String(b.direct_match_field || "")] || 99;
      if (af !== bf) return af - bf;

      const typePriority = { exact_full: 1, exact_phrase: 2, exact_token: 3, token_overlap: 4, important_partial_token: 5, soft_token: 6, partial_token: 7 };
      const at = typePriority[String(a.direct_match_type || "")] || 99;
      const bt = typePriority[String(b.direct_match_type || "")] || 99;
      if (at !== bt) return at - bt;

      return Number(a.id || 0) - Number(b.id || 0);
    });

  const out = uniqById(scored).slice(0, Math.min(limit, 30));

  if (String(process.env.SEARCH_DEBUG || "0") === "1") {
    console.log("[directNameKeywordSearch] done", {
      query,
      cleanedQuery,
      gender: detectGenderFromQuery(query),
      terms,
      allRows: allRows.length,
      genderRows: genderRows.length,
      requestedGender,
      prefiltered: prefiltered.length,
      returned: out.length,
      ms: Date.now() - start,
    });
  }

  return out;
}

function hasStrongDirectMatch(items = []) {
  const first = items?.[0];
  if (!first) return false;

  const score = Number(first.match_score || 0);
  const type = String(first.direct_match_type || "");
  const field = String(first.direct_match_field || "");

  if (["exact_full", "exact_phrase", "exact_token", "token_overlap"].includes(type)) return score >= 8500;
  if (type === "important_partial_token") return score >= 8800;
  if (type === "soft_token") return score >= 8500;
  if (["назва", "версія", "ключові слова"].includes(field) && score >= 9000) return true;

  return false;
}

module.exports = {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  applyCommonAliases,
  cleanDirectQuery,
  detectGenderFromQuery,
  normalizeDirectGenderValue,
  directGenderAllowed,
  tokenize,
  tokenSoftMatch,
  scoreField,
  buildPrefilterTerms,
};
