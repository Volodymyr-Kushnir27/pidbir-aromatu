const { getAllPerfumes } = require("./catalogRepo");

/**
 * Direct search по назві / keywords / version / description / notes.
 *
 * Основна задача:
 * - "Габа" має спочатку знаходити GABA / Габа / Hormone GABA
 * - "Габа" НЕ має автоматично ставити Dolce Gabbana вище
 * - "Лакоста" має знаходити "Лакост" / "Lacoste"
 * - "Лакост" має знаходити "Лакоста" / "Lacoste"
 * - "персиком" має знаходити "персик"
 * - "табаком" має знаходити "табак"
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

function applyCommonAliases(value) {
  let s = norm(value);

  const aliases = [
    // D&G / Dolce Gabbana
    ["d g", "dolce gabbana"],
    ["dg", "dolce gabbana"],
    ["d and g", "dolce gabbana"],
    ["dolce and gabbana", "dolce gabbana"],

    ["дольче габбана", "dolce gabbana"],
    ["дольче габана", "dolce gabbana"],
    ["дольче габбана", "dolce gabbana"],
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

    // Common translit / perfume terms
    ["парфюм", "perfume"],
    ["парфум", "perfume"],
    ["парфуми", "perfume"],
    ["духи", "perfume"],
    ["аромат", "perfume"],
    ["фрагранс", "fragrance"],
    ["фрагранс", "fragrance"],
  ];

  for (const [from, to] of aliases) {
    const re = new RegExp(`\\b${escapeRegExp(norm(from))}\\b`, "gi");
    s = s.replace(re, norm(to));
  }

  return norm(s);
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
    // Ukrainian / Russian longer endings
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

    // common case endings
    "ом",
    "ем",
    "ам",
    "ям",
    "ах",
    "ях",

    // adjectives
    "ий",
    "ій",
    "ый",
    "ая",
    "ое",
    "ые",
    "ие",
    "ою",

    // singular endings
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

  // Критично:
  // "габа" не має fuzzy-матчити "gabbana".
  // "ром" не має матчити "aroma".
  // "уд" не має матчити випадкові слова.
  if (len <= 4) return 0;

  // "лакоста" ↔ "лакост", "lacost" ↔ "lacoste"
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

  // Для коротких слів fuzzy вимкнений.
  if (q.length <= 4 || f.length <= 4) return false;

  const qForms = expandTokenForms(q);
  const fForms = expandTokenForms(f);

  for (const qf of qForms) {
    for (const ff of fForms) {
      if (!qf || !ff) continue;

      if (qf === ff) return true;

      // "лакоста" → "лакост"
      // "персиком" → "персик"
      // "табаком" → "табак"
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

function fieldTokens(value) {
  return tokenize(value);
}

function hasExactToken(fieldValue, queryToken) {
  const tokens = fieldTokens(fieldValue);
  const q = applyCommonAliases(queryToken);

  return tokens.includes(q);
}

function hasPhrase(fieldValue, query) {
  const field = applyCommonAliases(fieldValue);
  const q = applyCommonAliases(query);

  if (!q) return false;

  if (q.includes(" ")) {
    return field.includes(q);
  }

  return hasExactToken(field, q);
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
  const fTokens = fieldTokens(field);

  // 1. Повний збіг усього поля.
  // Наприклад field="gaba", query="gaba".
  if (field === q) {
    return {
      score: 12000 + fieldWeight,
      reason: "100% збіг",
      type: "exact_full",
    };
  }

  // 2. Точний збіг фрази.
  // Наприклад "light blue", "hormone paris", "dolce gabbana".
  if (q.includes(" ") && field.includes(q)) {
    return {
      score: 10000 + fieldWeight,
      reason: `точний збіг фрази: ${q}`,
      type: "exact_phrase",
    };
  }

  // 3. Одне слово — exact token.
  // "gaba" знайде тільки token "gaba", але не "gabbana".
  if (qTokens.length === 1 && fTokens.includes(qTokens[0])) {
    return {
      score: 9500 + fieldWeight,
      reason: `точний збіг слова: ${qTokens[0]}`,
      type: "exact_token",
    };
  }

  // 4. Точні перетини токенів.
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

  // 5. М'який збіг для відмінків / дрібних помилок.
  // "лакоста" ≈ "лакост"
  // "лакосте" ≈ "лакост"
  // "персиком" ≈ "персик"
  // "табаком" ≈ "табак"
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

  // 6. Prefix match.
  // Наприклад: imperat → imperatrice.
  // Для коротких запитів вимкнено.
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

  // 7. Дуже слабкий compact match.
  // Дає змогу "gaba" побачити "gabbana", але тільки низько в списку.
  // Точний GABA буде значно вище.
  const cq = compactRepeated(q);
  const cf = compactRepeated(field);

  if (q.length >= 4 && cf.includes(cq)) {
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
      key: "name",
      label: "назва",
      value: item.name,
      weight: 700,
    },
    {
      key: "keywords",
      label: "ключові слова",
      value: item.keywords,
      weight: 650,
    },
    {
      key: "version",
      label: "версія",
      value: item.version,
      weight: 500,
    },
    {
      key: "number_code",
      label: "код",
      value: item.number_code,
      weight: 450,
    },
    {
      key: "number_codes",
      label: "коди",
      value: item.number_codes,
      weight: 400,
    },
    {
      key: "description",
      label: "опис",
      value: item.description || item.short_desc,
      weight: 250,
    },
    {
      key: "notes",
      label: "ноти",
      value: item.notes,
      weight: 220,
    },
  ];

  let best = {
    score: 0,
    reason: "",
    field: "",
    type: "",
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
    why_selected: [`${best.reason} у полі "${best.field}"`],
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

function searchByNameAndKeywords(query, options = {}) {
  const limit = Number(options.limit || 100);
  const minScore = Number(options.minScore || 1200);

  const q = applyCommonAliases(query);

  if (!q || q.length < 2) return [];

  const rows = getAllPerfumes(5000);

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
        weak_compact: 8,
      };

      const at = typePriority[aType] || 99;
      const bt = typePriority[bType] || 99;

      if (at !== bt) return at - bt;

      // Якщо score однаковий — коротша назва частіше точніша.
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

  // exact / phrase / token — сильний збіг.
  if (
    type === "exact_full" ||
    type === "exact_phrase" ||
    type === "exact_token"
  ) {
    return score >= 9000;
  }

  // soft_token теж вважаємо достатнім для випадків:
  // Лакоста ↔ Лакост
  // Персиком ↔ Персик
  // Табаком ↔ Табак
  if (type === "soft_token") {
    return score >= 7000;
  }

  return false;
}

module.exports = {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  applyCommonAliases,

  // Для debug / тестів.
  tokenize,
  stemToken,
  tokenSoftMatch,
  scoreField,
};