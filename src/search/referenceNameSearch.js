const {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  cleanDirectQuery,
} = require("./directNameKeywordSearch");

const { normalizeGenderValue } = require("./candidateRerank");

function uniqStrings(arr = []) {
  return [
    ...new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildReferenceNameQueries(userText, analysis = {}, searchProfile = {}) {
  const raw = String(userText || "").trim();

  const base = [
    raw,
    analysis?.target_name,
    analysis?.brand && analysis?.target_name ? `${analysis.brand} ${analysis.target_name}` : "",
    analysis?.corrected_query,
    analysis?.translated_query,
    analysis?.normalized_query,
    analysis?.search_hint_text,
    ...(safeArray(analysis?.possible_names)),
    ...(safeArray(analysis?.name_aliases)),
    searchProfile?.reference_name,
    ...(safeArray(searchProfile?.possible_names)),
    ...(safeArray(searchProfile?.raw_terms)),
  ];

  const cleaned = base
    .map((x) => cleanDirectQuery(x))
    .filter((x) => x && x.length >= 2);

  return uniqStrings(cleaned).slice(0, 12);
}

function allowedByGender(item, requestedGender) {
  const req = normalizeGenderValue(requestedGender);
  if (!req || req === "unknown") return true;

  const itemGender = normalizeGenderValue(item?.gender);

  if (req === "female") return itemGender === "female" || itemGender === "unisex";
  if (req === "male") return itemGender === "male" || itemGender === "unisex";
  if (req === "unisex") return itemGender === "unisex";

  return true;
}

function findReferenceNameMatches(userText, analysis = {}, searchProfile = {}, options = {}) {
  const requestedGender =
    options.gender ||
    analysis?.gender ||
    analysis?.for_gender ||
    analysis?.target_gender ||
    searchProfile?.gender ||
    null;

  const queries = buildReferenceNameQueries(userText, analysis, searchProfile);
  const all = [];

  for (const query of queries) {
    const rows = searchByNameAndKeywords(query, {
      limit: Number(options.limit || 30),
      minScore: Number(options.minScore || 1200),
      scanLimit: Number(options.scanLimit || 1000),
    });

    for (const row of rows) {
      if (!allowedByGender(row, requestedGender)) continue;
      all.push({
        ...row,
        _reference_query: query,
      });
    }
  }

  const seen = new Set();
  const uniq = [];

  for (const item of all.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0))) {
    const id = Number(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniq.push(item);
  }

  return uniq.slice(0, Math.min(Number(options.limit || 30), 30));
}

module.exports = {
  buildReferenceNameQueries,
  findReferenceNameMatches,
  hasStrongReferenceNameMatch: hasStrongDirectMatch,
};
