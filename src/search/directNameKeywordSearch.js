const { findWeightedTextCandidates } = require("./catalogRepo");

/**
 * Direct search по назві / keywords / version / description / notes.
 *
 * Швидка версія:
 * 1. SQLite FTS/LIKE відбирає 50-120 кандидатів.
 * 2. JS fuzzy/scoring працює тільки по цих кандидатах.
 * 3. Не перебираємо всю БД у Node.js.
 *
 * Важливо:
 * - "лакоста" шукає: лакоста / лакост / лакосте / lacoste / lacost / lakosta / lakost
 * - "габа" шукає: габа / GABA / Hormone Paris
 * - "габа" НЕ має тягнути Dolce Gabbana через weak compact match.
 */

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[`’‘“”"«»]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr = []) {
  return [
    ...new Set(
      arr
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
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

function getAliases() {
  return [
    // Creed
    ["крид", "creed"],
    ["крід", "creed"],
    ["cread", "creed"],
    ["creed", "creed"],

    // D&G / Dolce Gabbana
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

    // Light Blue
    ["лайт блю", "light blue"],
    ["лайт блу", "light blue"],
    ["лаит блю", "light blue"],
    ["lite blue", "light blue"],
    ["блакитні", "blue"],
    ["блакитний", "blue"],
    ["голубые", "blue"],
    ["голубий", "blue"],

    // Imperatrice
    ["імператриця", "imperatrice"],
    ["императрица", "imperatrice"],
    ["імператриса", "imperatrice"],
    ["императриса", "imperatrice"],
    ["королева", "imperatrice"],

    // Lacoste
    ["лакоста", "lacoste"],
    ["лакосте", "lacoste"],
    ["лакост", "lacoste"],
    ["ла кост", "lacoste"],
    ["lacost", "lacoste"],
    ["lakosta", "lacoste"],
    ["lakost", "lacoste"],

    // Essential
    ["эссеншл", "essential"],
    ["эссеншел", "essential"],
    ["ессеншл", "essential"],
    ["ессеншел", "essential"],
    ["есеншл", "essential"],
    ["есеншел", "essential"],
    ["есеншиал", "essential"],
    ["ессеншиал", "essential"],
    ["essentiale", "essential"],

    // GABA / Hormone Paris
    ["габа", "gaba"],
    ["габа парфюм", "gaba perfume"],
    ["габа парфум", "gaba perfume"],
    ["гормон париж", "hormone paris"],
    ["хормон париж", "hormone paris"],
    ["хормон паріс", "hormone paris"],
    ["hormon paris", "hormone paris"],

    // Good Girl / direct translations
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

    // Common perfume terms
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

  const aliases = getAliases().sort(
    (a, b) => norm(b[0]).length - norm(a[0]).length,
  );

  for (const [from, to] of aliases) {
    const source = norm(from);
    if (!source) continue;

    // Без \b, бо \b погано працює з кирилицею у JS.
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
    "ами",
    "ями",
    "ого",
    "его",
    "ему",
    "ому",
    "ими",
    "ыми",
    "ою",
    "ею",
    "єю",
    "ой",
    "ей",
    "ом",
    "ем",
    "ам",
    "ям",
    "ах",
    "ях",
    "ий",
    "ій",
    "ый",
    "ая",
    "ое",
    "ые",
    "ие",
    "а",
    "у",
    "ю",
    "я",
    "е",
    "и",
    "і",
    "о",
  ];

  for (const ending of endings) {
    if (t.endsWith(ending) && t.length - ending.length >= 4) {
      return t.slice(0, -ending.length);
    }
  }

  return t;
}

function expandTokenForms(token) {
  const t = applyCommonAliases(token);
  const stem = stemToken(t);
  return unique([t, stem].filter(Boolean));
}

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");

  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const dp = Array.from({ length: s.length + 1 }, () =>
    Array(t.length + 1).fill(0),
  );

  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[s.length][t.length];
}

function fuzzyDistanceLimit(token) {
  const len = String(token || "").length;

  // Короткі слова не fuzzy-матчимо:
  // "габа" не має ставати "gabbana".
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 10) return 2;
  return 3;
}

function compactRepeated(value) {
  return applyCommonAliases(value).replace(/(.)\1+/g, "$1");
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

      if (qf.length >= 4 && ff.length >= 4) {
        if (qf.startsWith(ff) || ff.startsWith(qf)) return true;
      }

      const distance = levenshtein(qf, ff);
      if (distance <= fuzzyDistanceLimit(qf)) return true;
    }
  }

  return false;
}

function countSoftTokenMatches(queryTokens = [], fieldTokensList = []) {
  const matched = [];

  for (const q of queryTokens) {
    const hit = fieldTokensList.find((f) => tokenSoftMatch(q, f));

    if (hit) {
      matched.push(q);
    }
  }

  return unique(matched);
}

function isShortQuery(query) {
  const tokens = tokenize(query);
  return tokens.length === 1 && tokens[0].length <= 4;
}

function scoreField(fieldValue, query, fieldWeight) {
  const field = applyCommonAliases(fieldValue);
  const q = applyCommonAliases(query);

  if (!field || !q) {
    return {
      score: 0,
      reason: "",
      type: "",
    };
  }

  const qTokens = tokenize(q);
  const fTokens = tokenize(field);

  if (field === q) {
    return {
      score: 12000 + fieldWeight,
      reason: "100% збіг",
      type: "exact_full",
    };
  }

  if (q.includes(" ") && field.includes(q)) {
    return {
      score: 10000 + fieldWeight,
      reason: `точний збіг фрази: ${q}`,
      type: "exact_phrase",
    };
  }

  if (qTokens.length === 1 && fTokens.includes(qTokens[0])) {
    return {
      score: 9500 + fieldWeight,
      reason: `точний збіг слова: ${qTokens[0]}`,
      type: "exact_token",
    };
  }

  const exactOverlaps = qTokens.filter((token) => fTokens.includes(token));

  if (exactOverlaps.length >= 2) {
    return {
      score: 7800 + fieldWeight + exactOverlaps.length * 150,
      reason: `збіг слів: ${exactOverlaps.slice(0, 5).join(", ")}`,
      type: "token_overlap",
    };
  }

  if (exactOverlaps.length === 1 && qTokens.length > 1) {
    return {
      score: 4200 + fieldWeight,
      reason: `частковий збіг слова: ${exactOverlaps[0]}`,
      type: "partial_token",
    };
  }

  const softOverlaps = countSoftTokenMatches(qTokens, fTokens);

  if (softOverlaps.length >= 1) {
    const isSingleToken = qTokens.length === 1;

    return {
      score: isSingleToken
        ? 7200 + fieldWeight
        : 5600 + fieldWeight + softOverlaps.length * 100,
      reason: `схожий збіг слова: ${softOverlaps.slice(0, 5).join(", ")}`,
      type: "soft_token",
    };
  }

  if (!isShortQuery(q)) {
    const prefixHit = qTokens.find((qToken) =>
      fTokens.some(
        (fToken) =>
          qToken.length >= 4 &&
          fToken.length >= 4 &&
          fToken.startsWith(qToken),
      ),
    );

    if (prefixHit) {
      return {
        score: 3200 + fieldWeight,
        reason: `збіг по початку слова: ${prefixHit}`,
        type: "prefix",
      };
    }
  }

  const cq = compactRepeated(q);
  const cf = compactRepeated(field);

  // Критично: "gaba" НЕ має матчити "gabbana".
  if (q === "gaba") {
    return {
      score: 0,
      reason: "",
      type: "",
    };
  }

  // weak compact тільки для 5+ символів.
  if (q.length >= 5 && cf.includes(cq)) {
    return {
      score: 1400 + fieldWeight,
      reason: `слабкий схожий збіг: ${q}`,
      type: "weak_compact",
    };
  }

  return {
    score: 0,
    reason: "",
    type: "",
  };
}

function scorePerfume(item, query) {
  const fields = [
    {
      label: "назва",
      value: item.name,
      weight: 700,
    },
    {
      label: "ключові слова",
      value: item.keywords,
      weight: 650,
    },
    {
      label: "версія",
      value: item.version,
      weight: 500,
    },
    {
      label: "код",
      value: item.number_code,
      weight: 450,
    },
    {
      label: "коди",
      value: item.number_codes,
      weight: 400,
    },
    {
      label: "опис",
      value: item.description || item.short_desc,
      weight: 250,
    },
    {
      label: "ноти",
      value: item.notes,
      weight: 220,
    },
  ];

  let best = {
    score: Number(item.sql_score || 0),
    reason: item.sql_field ? "збіг через швидкий SQL/FTS-пошук" : "",
    field: item.sql_field || "",
    type: item.sql_field ? "sql_prefilter" : "",
  };

  for (const field of fields) {
    const scored = scoreField(field.value, query, field.weight);

    if (scored.score > best.score) {
      best = {
        score: scored.score,
        reason: scored.reason,
        field: field.label,
        type: scored.type,
      };
    }
  }

  if (!best.score) return null;

  return {
    ...item,
    match_score: best.score,
    match_bucket: "direct_name_keyword",
    direct_match_type: best.type,
    direct_match_field: best.field,
    why_selected: [
      best.field
        ? `${best.reason} у полі "${best.field}"`
        : best.reason || "збіг у швидкому пошуку",
    ],
    _debug: {
      ...(item._debug || {}),
      directNameKeywordSearch: {
        score: best.score,
        field: best.field,
        type: best.type,
      },
    },
  };
}

function buildPrefilterTerms(query) {
  const raw = norm(query);
  const aliased = applyCommonAliases(query);

  const base = [raw, aliased];
  const extra = [];

  const compactRaw = raw.replace(/\s+/g, "");
  const compactAliased = aliased.replace(/\s+/g, "");

  // Lacoste:
  // Якщо користувач пише "лакоста", треба шукати і кирилицю, і латиницю.
  if (
    compactRaw.includes("лакост") ||
    compactRaw.includes("лакоста") ||
    compactRaw.includes("лакосте") ||
    compactAliased.includes("lacoste")
  ) {
    extra.push(
      "лакоста",
      "лакост",
      "лакосте",
      "lacoste",
      "lacost",
      "lakosta",
      "lakost",
      "essential",
      "эссеншл",
      "эссеншел",
      "ессеншл",
      "ессеншел",
      "есеншл",
      "есеншел",
    );
  }

  // GABA / Hormone Paris:
  // Не плутати з Gabbana.
  if (
    compactRaw.includes("габа") ||
    compactAliased.includes("gaba") ||
    compactRaw.includes("hormone") ||
    compactRaw.includes("гормон") ||
    compactRaw.includes("хормон")
  ) {
    extra.push(
      "габа",
      "gaba",
      "hormone",
      "hormone paris",
      "гормон",
      "хормон",
      "париж",
      "паріс",
    );
  }

  // Good Girl.
  if (
    compactRaw.includes("дівчин") ||
    compactRaw.includes("девоч") ||
    compactRaw.includes("гуд") ||
    compactAliased.includes("goodgirl")
  ) {
    extra.push(
      "good girl",
      "good",
      "girl",
      "гуд",
      "герл",
      "гірл",
      "гьорл",
      "дівчинка",
      "девочка",
    );
  }

  const rawTokens = raw.split(/\s+/).filter((x) => x.length >= 2);
  const aliasedTokens = aliased.split(/\s+/).filter((x) => x.length >= 2);

  const stems = [...rawTokens, ...aliasedTokens, ...extra]
    .map((x) => stemToken(x))
    .filter((x) => x.length >= 2);

  return unique([
    ...base,
    ...extra,
    ...rawTokens,
    ...aliasedTokens,
    ...stems,
  ]).slice(0, 24);
}

function searchByNameAndKeywords(query, options = {}) {
  const limit = Number(options.limit || 100);
  const minScore = Number(options.minScore || 1200);
  const scanLimit = Number(options.scanLimit || 120);

  const q = applyCommonAliases(query);
  if (!q || q.length < 2) return [];

  const prefilterTerms = buildPrefilterTerms(query);
  const rows = findWeightedTextCandidates(prefilterTerms, scanLimit);

  const scored = rows
    .map((item) => scorePerfume(item, q))
    .filter(Boolean)
    .filter((item) => Number(item.match_score || 0) >= minScore)
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      const aType = String(a.direct_match_type || "");
      const bType = String(b.direct_match_type || "");

      const typePriority = {
        exact_full: 1,
        exact_phrase: 2,
        exact_token: 3,
        token_overlap: 4,
        soft_token: 5,
        partial_token: 6,
        prefix: 7,
        sql_prefilter: 8,
        weak_compact: 9,
      };

      const at = typePriority[aType] || 99;
      const bt = typePriority[bType] || 99;

      if (at !== bt) return at - bt;

      const an = String(a.name || "").length;
      const bn = String(b.name || "").length;

      if (an !== bn) return an - bn;

      return Number(a.id || 0) - Number(b.id || 0);
    });

  return uniqById(scored).slice(0, limit);
}

function hasStrongDirectMatch(items = []) {
  const first = items?.[0];
  if (!first) return false;

  const score = Number(first.match_score || 0);
  const type = String(first.direct_match_type || "");
  const field = String(first.direct_match_field || "");

  if (
    type === "exact_full" ||
    type === "exact_phrase" ||
    type === "exact_token"
  ) {
    return score >= 9000;
  }

  if (type === "soft_token") {
    return score >= 7000;
  }

  // FTS/SQL по name/keywords/notes також може бути сильним direct-збігом.
  if (
    type === "sql_prefilter" &&
    score >= 8000 &&
    ["keywords", "name", "notes", "fts"].includes(field)
  ) {
    return true;
  }

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
