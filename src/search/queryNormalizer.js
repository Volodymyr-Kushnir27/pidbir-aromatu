const {
  cleanDirectQuery,
  applyCommonAliases,
  detectGenderFromQuery,
} = require("./directNameKeywordSearch");

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[ʼ’‘`´]/g, "'")
    .replace(/[“”"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocalQuery(userText) {
  const raw = String(userText || "").trim();
  const gender = detectGenderFromQuery(raw);
  const cleanQuery = cleanDirectQuery(raw);
  const aliasedQuery = applyCommonAliases(cleanQuery);

  return {
    raw,
    normalizedRaw: norm(raw),
    gender,
    cleanQuery,
    aliasedQuery,
    isProbablyDirectName: Boolean(cleanQuery && cleanQuery.split(/\s+/).length <= 6),
  };
}

module.exports = {
  parseLocalQuery,
};
