const { getAllPerfumes } = require("./catalogRepo");

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[`’‘“”"«»]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zа-яіїєґ0-9]+/gi, " ")
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
    ["дольче энд габбана", "dolce gabbana"],
    ["дольче енд габбана", "dolce gabbana"],
    ["дольче", "dolce"],
    ["габбана", "gabbana"],
    ["габана", "gabbana"],

    // Light Blue
    ["лайт блю", "light blue"],
    ["лайт блу", "light blue"],
    ["блакитні", "blue"],
    ["голубые", "blue"],
    ["голубий", "blue"],

    // Imperatrice
    ["імператриця", "imperatrice"],
    ["императрица", "imperatrice"],
    ["королева", "imperatrice"],

    // GABA / Hormone Paris
    ["габа", "gaba"],
    ["габа парфюм", "gaba perfume"],
    ["гормон париж", "hormone paris"],
    ["хормон париж", "hormone paris"],
    ["хормон паріс", "hormone paris"],
    ["hormon paris", "hormone paris"],
  ];

  for (const [from, to] of aliases) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
    s = s.replace(re, to);
  }

  return norm(s);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(value) {
  return applyCommonAliases(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
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

  for (const item of items) {
    const id = Number(item?.id);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    out.push(item);
  }

  return out;
}

function compactRepeated(value) {
  return applyCommonAliases(value).replace(/(.)\1+/g, "$1");
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
  if (field === q) {
    return {
      score: 12000 + fieldWeight,
      reason: "100% збіг",
      type: "exact_full",
    };
  }

  // 2. Точний збіг фрази.
  if (q.includes(" ") && field.includes(q)) {
    return {
      score: 10000 + fieldWeight,
      reason: `точний збіг фрази: ${q}`,
      type: "exact_phrase",
    };
  }

  // 3. Одне слово — тільки exact token.
  // Це захищає "gaba" від автоматичного підняття "gabbana".
  if (qTokens.length === 1 && fTokens.includes(qTokens[0])) {
    return {
      score: 9500 + fieldWeight,
      reason: `точний збіг слова: ${qTokens[0]}`,
      type: "exact_token",
    };
  }

  // 4. Кілька токенів — рахуємо точні перетини.
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

  // 5. Prefix match.
  // Наприклад: imperat → imperatrice.
  if (!isShortQuery(q)) {
    const prefixHit = qTokens.find((qToken) =>
      fTokens.some((fToken) => fToken.startsWith(qToken) && qToken.length >= 4),
    );

    if (prefixHit) {
      return {
        score: 3200 + fieldWeight,
        reason: `збіг по початку слова: ${prefixHit}`,
        type: "prefix",
      };
    }
  }

  // 6. Дуже слабкий compact match.
  // Для "gaba" може знайти "gabbana", але сильно нижче ніж точний GABA.
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
      weight: 600,
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
      key: "description",
      label: "опис",
      value: item.description || item.short_desc,
      weight: 250,
    },
    {
      key: "notes",
      label: "ноти",
      value: item.notes,
      weight: 200,
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
    why_selected: [
      `${best.reason} у полі "${best.field}"`,
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

  return Number(first.match_score || 0) >= 9000;
}

module.exports = {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  applyCommonAliases,
};