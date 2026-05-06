const { getAllPerfumes } = require("./catalogRepo");

/**
 * FAST direct DB search before AI.
 *
 * Чому цей файл потрібен:
 * - старий direct search робив fuzzy/Levenshtein по всіх полях усіх рядків;
 * - на Render це могло зависати на 2/7 або 3/7;
 * - цей варіант спочатку робить дешевий prefilter, а fuzzy застосовує тільки до name/version/keywords.
 *
 * Priority:
 * 1. name
 * 2. version  — alias-назви / переклади / альтернативні назви
 * 3. keywords
 * 4. number codes
 * 5. notes/description тільки як слабкий fallback
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
    .replace(/[ʼ’‘`´]/g, "'")
    .replace(/[“”"«»]/g, " ")
    .replace(/&/g, " and ")
    .replace(/№/g, " ")
    .replace(/[^a-zа-яіїє0-9']+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return norm(value).replace(/\s+/g, "");
}

function getAliases() {
  return [
    ["том форд", "tom ford"],
    ["томфорд", "tom ford"],
    ["том форт", "tom ford"],
    ["том ford", "tom ford"],
    ["tom ford", "tom ford"],
    ["tomford", "tom ford"],
    ["tf", "tom ford"],

    ["пако рабан", "paco rabanne"],
    ["пако рабане", "paco rabanne"],
    ["пако рабанне", "paco rabanne"],
    ["пако рабани", "paco rabanne"],
    ["пако рабані", "paco rabanne"],
    ["пако рабанн", "paco rabanne"],
    ["пако карабан", "paco rabanne"],
    ["пако карабанн", "paco rabanne"],
    ["карабан", "rabanne"],
    ["карабане", "rabanne"],
    ["карабанне", "rabanne"],
    ["пако", "paco"],
    ["рабан", "rabanne"],
    ["рабане", "rabanne"],
    ["рабанне", "rabanne"],
    ["рабані", "rabanne"],
    ["paco rabane", "paco rabanne"],
    ["paco rabanne", "paco rabanne"],
    ["rabane", "rabanne"],
    ["rabanne", "rabanne"],

    ["крид", "creed"],
    ["крід", "creed"],
    ["cread", "creed"],
    ["creed", "creed"],

    ["d g", "dolce gabbana"],
    ["dg", "dolce gabbana"],
    ["d and g", "dolce gabbana"],
    ["dolce and gabbana", "dolce gabbana"],
    ["дольче габбана", "dolce gabbana"],
    ["дольче габана", "dolce gabbana"],
    ["дольче энд габбана", "dolce gabbana"],
    ["дольче енд габбана", "dolce gabbana"],
    ["дольче", "dolce"],
    ["габбана", "gabbana"],
    ["габана", "gabbana"],

    ["лайт блю", "light blue"],
    ["лайт блу", "light blue"],
    ["лаит блю", "light blue"],
    ["lite blue", "light blue"],
    ["блакитні", "blue"],
    ["блакитний", "blue"],
    ["голубые", "blue"],
    ["голубий", "blue"],

    ["імператриця", "imperatrice"],
    ["императрица", "imperatrice"],
    ["імператриса", "imperatrice"],
    ["императриса", "imperatrice"],
    ["императриця", "imperatrice"],
    ["імператрица", "imperatrice"],
    ["імператриц", "imperatrice"],
    ["императриц", "imperatrice"],
    ["l imperatrice", "imperatrice"],
    ["l'imperatrice", "imperatrice"],
    ["limperatrice", "imperatrice"],
    ["imperatrice", "imperatrice"],
    ["королева", "imperatrice"],

    ["лакоста", "lacoste"],
    ["лакосте", "lacoste"],
    ["лакост", "lacoste"],
    ["ла кост", "lacoste"],
    ["lacost", "lacoste"],
    ["lakosta", "lacoste"],
    ["lakost", "lacoste"],

    ["эссеншл", "essential"],
    ["эссеншел", "essential"],
    ["ессеншл", "essential"],
    ["ессеншел", "essential"],
    ["есеншл", "essential"],
    ["есеншел", "essential"],
    ["есеншиал", "essential"],
    ["ессеншиал", "essential"],
    ["essentiale", "essential"],

    ["габа", "gaba"],
    ["габа парфюм", "gaba perfume"],
    ["габа парфум", "gaba perfume"],
    ["гормон париж", "hormone paris"],
    ["хормон париж", "hormone paris"],
    ["хормон паріс", "hormone paris"],
    ["hormon paris", "hormone paris"],

    ["гарна дівчинка стала поганою", "good girl gone bad"],
    ["хороша дівчинка стала поганою", "good girl gone bad"],
    ["хорошая девочка стала плохой", "good girl gone bad"],
    ["good girl gone bad", "good girl gone bad"],
    ["гуд герл гон бед", "good girl gone bad"],
    ["гуд гьорл гон бед", "good girl gone bad"],
    ["гуд гірл гон бед", "good girl gone bad"],
    ["погана дівчинка", "good girl gone bad"],
    ["плохая девочка", "good girl gone bad"],
    ["дуже гарна дівчинка", "very good girl"],
    ["дуже хороша дівчинка", "very good girl"],
    ["очень хорошая девочка", "very good girl"],
    ["very good girl", "very good girl"],
    ["вері гуд герл", "very good girl"],
    ["вери гуд герл", "very good girl"],
    ["гарна дівчинка", "good girl"],
    ["красива дівчинка", "good girl"],
    ["хороша дівчинка", "good girl"],
    ["добра дівчинка", "good girl"],
    ["гарна девочка", "good girl"],
    ["красивая девочка", "good girl"],
    ["хорошая девочка", "good girl"],
    ["добрая девочка", "good girl"],
    ["good girl", "good girl"],
    ["гуд герл", "good girl"],
    ["гуд гьорл", "good girl"],
    ["гуд гірл", "good girl"],
    ["гуд гарл", "good girl"],
    ["гуд гел", "good girl"],

    ["чорний опіум", "black opium"],
    ["черный опиум", "black opium"],
    ["блек опіум", "black opium"],
    ["блек опиум", "black opium"],
    ["ла ві е бель", "la vie est belle"],
    ["лаві е бель", "la vie est belle"],
    ["ля ви э бель", "la vie est belle"],

    ["парфюм", "perfume"],
    ["парфум", "perfume"],
    ["парфуми", "perfume"],
    ["духи", "perfume"],
    ["аромат", "perfume"],
    ["фрагранс", "fragrance"],
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

function tokenize(value) {
  return applyCommonAliases(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function stemToken(token) {
  let t = applyCommonAliases(token);
  if (t.length <= 4) return t;

  const endings = [
    "ами", "ями", "ого", "его", "ему", "ому", "ими", "ыми", "ою", "ею", "єю",
    "ой", "ей", "ом", "ем", "ам", "ям", "ах", "ях", "ий", "ій", "ый", "ая",
    "ое", "ые", "ие", "а", "у", "ю", "я", "е", "и", "і", "о",
  ];

  for (const ending of endings) {
    if (t.endsWith(ending) && t.length - ending.length >= 4) return t.slice(0, -ending.length);
  }

  return t;
}

function expandTokenForms(token) {
  const t = applyCommonAliases(token);
  const stem = stemToken(t);
  return unique([t, stem].filter(Boolean));
}

function levenshteinLimited(a, b, limit = 2) {
  const s = String(a || "");
  const t = String(b || "");

  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  if (Math.abs(s.length - t.length) > limit) return limit + 1;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  let curr = new Array(t.length + 1);

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];

    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }

    if (rowMin > limit) return limit + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[t.length];
}

function fuzzyDistanceLimit(token) {
  const len = String(token || "").length;
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 10) return 2;
  return 2;
}

function tokenSoftMatch(queryToken, fieldToken) {
  const q = applyCommonAliases(queryToken);
  const f = applyCommonAliases(fieldToken);

  if (!q || !f) return false;
  if (q === f) return true;
  if (q.length <= 4 || f.length <= 4) return false;

  const qForms = expandTokenForms(q);
  const fForms = expandTokenForms(f);

  for (const qf of qForms) {
    for (const ff of fForms) {
      if (!qf || !ff) continue;
      if (qf === ff) return true;
      if (qf.length >= 4 && ff.length >= 4 && (qf.startsWith(ff) || ff.startsWith(qf))) return true;
      const limit = fuzzyDistanceLimit(qf);
      if (levenshteinLimited(qf, ff, limit) <= limit) return true;
    }
  }

  return false;
}

function countSoftTokenMatches(queryTokens = [], fieldTokensList = []) {
  const matched = [];
  const limitedFieldTokens = unique(fieldTokensList).slice(0, 60);

  for (const q of queryTokens.slice(0, 5)) {
    const hit = limitedFieldTokens.find((f) => tokenSoftMatch(q, f));
    if (hit) matched.push(q);
  }

  return unique(matched);
}

function phraseRegex(phrase) {
  const p = norm(phrase);
  if (!p) return null;
  const parts = p.split(/\s+/).map(escapeRegExp);
  return new RegExp(`(^|\\s)${parts.join("\\s+")}(?=\\s|$)`, "i");
}

function hasPhrase(field, phrase) {
  const f = norm(field);
  const re = phraseRegex(phrase);
  return Boolean(re && re.test(f));
}

function scoreField(fieldValue, query, fieldWeight, fieldName) {
  const field = applyCommonAliases(fieldValue);
  const originalField = norm(fieldValue);
  const q = applyCommonAliases(query);
  const originalQuery = norm(query);

  if (!field || !q) return { score: 0, reason: "", type: "" };

  const qTokens = tokenize(q).slice(0, 5);
  const fTokens = tokenize(field).slice(0, 80);

  if (field === q || originalField === originalQuery) {
    return { score: 13000 + fieldWeight, reason: "100% збіг", type: "exact_full" };
  }

  if (q.includes(" ") && (hasPhrase(field, q) || hasPhrase(originalField, originalQuery))) {
    return { score: 11500 + fieldWeight, reason: `точний збіг фрази: ${q}`, type: "exact_phrase" };
  }

  if (qTokens.length === 1 && fTokens.includes(qTokens[0])) {
    return { score: 10000 + fieldWeight, reason: `точний збіг слова: ${qTokens[0]}`, type: "exact_token" };
  }

  const exactOverlaps = qTokens.filter((token) => fTokens.includes(token));

  if (exactOverlaps.length >= 2) {
    return {
      score: 8800 + fieldWeight + exactOverlaps.length * 180,
      reason: `збіг слів: ${exactOverlaps.slice(0, 5).join(", ")}`,
      type: "token_overlap",
    };
  }

  if (exactOverlaps.length === 1 && ["назва", "версія", "ключові слова"].includes(fieldName)) {
    return {
      score: 7600 + fieldWeight,
      reason: `точний частковий збіг: ${exactOverlaps[0]}`,
      type: "important_partial_token",
    };
  }

  if (exactOverlaps.length === 1 && qTokens.length > 1) {
    return { score: 4800 + fieldWeight, reason: `частковий збіг слова: ${exactOverlaps[0]}`, type: "partial_token" };
  }

  // Fuzzy only for short/high-value fields. Notes/description fuzzy was the main performance trap.
  if (["назва", "версія", "ключові слова"].includes(fieldName)) {
    const softOverlaps = countSoftTokenMatches(qTokens, fTokens);
    if (softOverlaps.length >= 1) {
      return {
        score: qTokens.length === 1 ? 7600 + fieldWeight : 6000 + fieldWeight + softOverlaps.length * 120,
        reason: `схожий збіг слова: ${softOverlaps.slice(0, 5).join(", ")}`,
        type: "soft_token",
      };
    }
  }

  return { score: 0, reason: "", type: "" };
}

function scorePerfume(item, query) {
  const fields = [
    { label: "назва", value: item.name, weight: 1800 },
    { label: "версія", value: item.version, weight: 1700 },
    { label: "ключові слова", value: item.keywords, weight: 1200 },
    { label: "код", value: item.number_code, weight: 300 },
    { label: "коди", value: item.number_codes, weight: 250 },
    { label: "ноти", value: item.notes, weight: 350 },
    { label: "опис", value: item.description || item.short_desc, weight: 100 },
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
  const raw = norm(query);
  const aliased = applyCommonAliases(query);
  const extra = [];
  const compactRaw = compact(query);
  const compactAliased = compact(aliased);

  if (compactRaw.includes("томфорд") || compactAliased.includes("tomford") || aliased.includes("tom ford")) {
    extra.push("том форд", "томфорд", "tom ford", "tomford", "ford");
  }

  if (
    compactRaw.includes("пакорабан") ||
    compactRaw.includes("пакокарабан") ||
    compactRaw.includes("рабан") ||
    compactRaw.includes("карабан") ||
    compactAliased.includes("pacorabanne") ||
    compactAliased.includes("rabanne") ||
    aliased.includes("paco rabanne")
  ) {
    extra.push("пако рабан", "пако карабан", "рабан", "карабан", "paco rabanne", "rabanne", "paco");
  }

  if (compactRaw.includes("императриц") || compactRaw.includes("імператриц") || compactAliased.includes("imperatrice") || aliased.includes("imperatrice")) {
    extra.push("императрица", "імператриця", "imperatrice", "l imperatrice", "l'imperatrice", "dolce gabbana imperatrice");
  }

  if (compactRaw.includes("лакост") || compactAliased.includes("lacoste") || aliased.includes("lacoste")) {
    extra.push("лакоста", "лакост", "лакосте", "lacoste", "lacost", "lakosta", "lakost", "essential", "эссеншл", "эссеншел", "ессеншл", "ессеншел", "есеншл", "есеншел");
  }

  if (compactRaw.includes("габа") || compactAliased.includes("gaba") || compactRaw.includes("гормон") || compactRaw.includes("хормон")) {
    extra.push("габа", "gaba", "hormone", "hormone paris", "гормон", "хормон", "париж", "паріс");
  }

  if (compactRaw.includes("дівчин") || compactRaw.includes("девоч") || compactRaw.includes("гуд") || compactAliased.includes("goodgirl")) {
    extra.push("good girl", "very good girl", "good girl gone bad", "good", "girl", "гуд", "герл", "гірл", "гьорл", "дівчинка", "девочка", "погана дівчинка", "плохая девочка", "гарна дівчинка", "хорошая девочка");
  }

  const rawTokens = raw.split(/\s+/).filter((x) => x.length >= 2);
  const aliasedTokens = aliased.split(/\s+/).filter((x) => x.length >= 2);
  const stems = [...rawTokens, ...aliasedTokens, ...extra].map((x) => stemToken(x)).filter((x) => x.length >= 2);

  return unique([raw, aliased, ...extra, ...rawTokens, ...aliasedTokens, ...stems]).slice(0, 35);
}

function buildSearchableHighValueText(item) {
  return applyCommonAliases([
    item?.name,
    item?.version,
    item?.keywords,
    item?.number_code,
    item?.number_codes,
  ].filter(Boolean).join(" "));
}

function buildSearchableFullText(item) {
  return applyCommonAliases([
    item?.name,
    item?.version,
    item?.keywords,
    item?.number_code,
    item?.number_codes,
    item?.notes,
    item?.description || item?.short_desc,
  ].filter(Boolean).join(" "));
}

function itemPassesFastPrefilter(item, terms = []) {
  const high = buildSearchableHighValueText(item);
  const full = buildSearchableFullText(item);

  for (const term of terms) {
    const t = applyCommonAliases(term);
    if (!t) continue;

    if (high.includes(t)) return true;

    const tokens = tokenize(t);
    if (tokens.some((token) => token.length >= 3 && high.includes(token))) return true;

    // Full text only exact phrase/tokens, no fuzzy.
    if (t.length >= 4 && full.includes(t)) return true;
  }

  return false;
}

function searchByNameAndKeywords(query, options = {}) {
  const started = Date.now();
  const limit = Number(options.limit || 100);
  const minScore = Number(options.minScore || 1200);
  const scanLimit = Number(options.scanLimit || 1000);

  const q = applyCommonAliases(query);
  if (!q || q.length < 2) return [];

  const terms = buildPrefilterTerms(query);
  const allRows = getAllPerfumes(scanLimit);

  // Critical performance fix: do not fuzzy-score every row/field.
  const prefiltered = allRows.filter((item) => itemPassesFastPrefilter(item, terms));
  const rowsToScore = prefiltered.length ? prefiltered : allRows.slice(0, Math.min(allRows.length, 300));

  const scored = rowsToScore
    .map((item) => {
      const allScores = terms.map((term) => scorePerfume(item, term)).filter(Boolean);
      if (!allScores.length) return null;
      allScores.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0));
      return allScores[0];
    })
    .filter(Boolean)
    .filter((item) => Number(item.match_score || 0) >= minScore)
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      const fieldPriority = { "назва": 1, "версія": 2, "ключові слова": 3, "код": 4, "коди": 5, "ноти": 6, "опис": 7 };
      const af = fieldPriority[String(a.direct_match_field || "")] || 99;
      const bf = fieldPriority[String(b.direct_match_field || "")] || 99;
      if (af !== bf) return af - bf;

      const typePriority = { exact_full: 1, exact_phrase: 2, exact_token: 3, token_overlap: 4, important_partial_token: 5, soft_token: 6, partial_token: 7 };
      const at = typePriority[String(a.direct_match_type || "")] || 99;
      const bt = typePriority[String(b.direct_match_type || "")] || 99;
      if (at !== bt) return at - bt;

      return Number(a.id || 0) - Number(b.id || 0);
    });

  const out = uniqById(scored).slice(0, limit);

  if (String(process.env.SEARCH_DEBUG || "0") === "1") {
    console.log("[directNameKeywordSearch] done", {
      query,
      terms: terms.slice(0, 10),
      allRows: allRows.length,
      prefiltered: prefiltered.length,
      returned: out.length,
      ms: Date.now() - started,
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

  if (["exact_full", "exact_phrase", "exact_token", "token_overlap", "important_partial_token"].includes(type)) return score >= 8200;
  if (type === "soft_token") return score >= 7600;
  if (["назва", "версія", "ключові слова"].includes(field) && score >= 7600) return true;

  return false;
}

module.exports = {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  applyCommonAliases,
  tokenize,
  stemToken,
  tokenSoftMatch,
  scoreField,
  buildPrefilterTerms,
};
