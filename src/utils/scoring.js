const { norm, uniq } = require("./text");

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(String(text || ""));
}

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  // важливо: спочатку unisex, потім female, потім male
  if (
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    hasWord(g, "unisex")
  ) {
    return "unisex";
  }

  if (
    g.includes("жіноч") ||
    g.includes("женск") ||
    hasWord(g, "female") ||
    hasWord(g, "women") ||
    hasWord(g, "woman")
  ) {
    return "female";
  }

  if (
    g.includes("чолов") ||
    g.includes("мужск") ||
    hasWord(g, "male") ||
    hasWord(g, "men") ||
    hasWord(g, "man")
  ) {
    return "male";
  }

  return "unknown";
}

function splitMulti(value) {
  return uniq(
    String(value || "")
      .split(/[;,/|]+/)
      .map((x) => norm(x))
      .filter(Boolean),
  );
}

function makeHaystack(row) {
  return norm(
    [
      row.name,
      row.brand,
      row.gender,
      row.season,
      row.category,
      row.notes,
      row.accords,
      row.keywords,
      row.short_desc,
      row.description,
      row.version,
      row.occasion,
      row.age,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

function includesAny(haystack, arr = []) {
  const found = [];

  for (const raw of arr || []) {
    const t = norm(raw);
    if (!t) continue;
    if (haystack.includes(t)) found.push(t);
  }

  return uniq(found);
}

function scoreGender(row, profile) {
  const req = normalizeGenderValue(profile?.gender);
  const item = normalizeGenderValue(row?.gender);

  if (!req || req === "unknown") return 0;
  if (!item || item === "unknown") return 0;

  if (req === "female") {
    if (item === "female") return 40;
    if (item === "unisex") return 0;
    return -120;
  }

  if (req === "male") {
    if (item === "male") return 40;
    if (item === "unisex") return 0;
    return -120;
  }

  if (req === "unisex") {
    if (item === "unisex") return 40;
    return -60;
  }

  return 0;
}

function scoreSeason(row, profile) {
  const reqSeasons = splitMulti(profile?.season);
  if (!reqSeasons.length) return 0;

  const itemSeasons = splitMulti(row?.season);
  if (!itemSeasons.length) return 0;

  const match = itemSeasons.filter((x) => reqSeasons.includes(x));
  return match.length * 10;
}

function scoreBestFor(row, profile) {
  const req = uniq((profile?.best_for || []).map((x) => norm(x)).filter(Boolean));
  if (!req.length) return 0;

  const haystack = makeHaystack(row);
  const matched = includesAny(haystack, req);

  return matched.length * 8;
}

function scoreNotes(row, profile) {
  const haystack = makeHaystack(row);

  const includeTerms = uniq(
    [
      ...(profile?.notes_include || []),
      ...(profile?.notes_include_synonyms || []),
    ].map((x) => norm(x)).filter(Boolean),
  );

  const preferTerms = uniq(
    [
      ...(profile?.notes_prefer || []),
      ...(profile?.notes_prefer_synonyms || []),
    ].map((x) => norm(x)).filter(Boolean),
  );

  const includeMatched = includesAny(haystack, includeTerms);
  const preferMatched = includesAny(haystack, preferTerms);

  let score = 0;
  score += includeMatched.length * 16;
  score += preferMatched.length * 10;

  return score;
}

function scoreAccords(row, profile) {
  const haystack = makeHaystack(row);

  const accordTerms = uniq(
    [
      ...(profile?.accords || []),
      ...(profile?.accord_synonyms || []),
      ...(profile?.style_tags || []),
      ...(profile?.style_synonyms || []),
    ].map((x) => norm(x)).filter(Boolean),
  );

  const matched = includesAny(haystack, accordTerms);
  return matched.length * 9;
}

function scoreProjection(profile) {
  return profile?.projection && profile.projection !== "unknown" ? 3 : 0;
}

function scoreLongevity(profile) {
  return profile?.longevity && profile.longevity !== "unknown" ? 3 : 0;
}

function scoreAgeGroup(profile) {
  return profile?.age_group && profile.age_group !== "unknown" ? 2 : 0;
}

function scoreRawTerms(row, profile) {
  const haystack = makeHaystack(row);
  const rawTerms = uniq((profile?.raw_terms || []).map((x) => norm(x)).filter(Boolean));
  const matched = includesAny(haystack, rawTerms);

  return matched.length * 5;
}

function scoreExclude(row, profile) {
  const haystack = makeHaystack(row);
  const excludeTerms = uniq((profile?.exclude_tags || []).map((x) => norm(x)).filter(Boolean));
  const matched = includesAny(haystack, excludeTerms);

  return matched.length * -14;
}

function scoreCandidate(row, profile = {}) {
  let score = 0;

  score += scoreGender(row, profile);
  score += scoreSeason(row, profile);
  score += scoreBestFor(row, profile);
  score += scoreNotes(row, profile);
  score += scoreAccords(row, profile);
  score += scoreRawTerms(row, profile);
  score += scoreExclude(row, profile);

  // слабкі бонуси за наявність додаткових уточнень у профілі
  score += scoreProjection(profile);
  score += scoreLongevity(profile);
  score += scoreAgeGroup(profile);

  return score;
}

module.exports = {
  scoreCandidate,
  normalizeGenderValue,
};