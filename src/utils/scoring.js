const { norm } = require("./text");

function contains(haystack, needle) {
  return norm(haystack).includes(norm(needle));
}

function normalizeGenderValue(value) {
  const g = norm(value);

  if (
    g.includes("male") ||
    g.includes("man") ||
    g.includes("men") ||
    g.includes("чолов") ||
    g.includes("муж")
  ) {
    return "male";
  }

  if (
    g.includes("female") ||
    g.includes("woman") ||
    g.includes("women") ||
    g.includes("жіноч") ||
    g.includes("жен")
  ) {
    return "female";
  }

  if (g.includes("unisex") || g.includes("унісекс") || g.includes("унисекс")) {
    return "unisex";
  }

  return "unknown";
}

function genderScore(rowGender, requestedGender) {
  const rowG = normalizeGenderValue(rowGender);
  const reqG = normalizeGenderValue(requestedGender);

  if (reqG === "unknown") return 0;

  if (reqG === "male") {
    if (rowG === "male") return 30;
    if (rowG === "unisex") return 18;
    return -100;
  }

  if (reqG === "female") {
    if (rowG === "female") return 30;
    if (rowG === "unisex") return 18;
    return -100;
  }

  if (reqG === "unisex") {
    if (rowG === "unisex") return 30;
    if (rowG === "male" || rowG === "female") return 12;
    return 0;
  }

  return 0;
}

function scoreCandidate(row, profile) {
  let score = 0;

  const haystack = [
    row.name,
    row.brand,
    row.gender,
    row.season,
    row.category,
    row.notes,
    row.accords,
    row.short_desc,
    row.description,
    row.keywords,
    row.occasion,
    row.age,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  // gender = база фільтрації
  score += genderScore(row.gender, profile.gender);

  if (score <= -100) return score;

  for (const season of profile.season || []) {
    if (contains(haystack, season)) score += 5;
  }

  for (const note of profile.notes_include || []) {
    if (contains(haystack, note)) score += 9;
  }

  for (const note of profile.notes_prefer || []) {
    if (contains(haystack, note)) score += 4;
  }

  for (const accord of profile.accords || []) {
    if (contains(haystack, accord)) score += 6;
  }

  for (const tag of profile.style_tags || []) {
    if (contains(haystack, tag)) score += 3;
  }

  for (const usage of profile.best_for || []) {
    if (contains(haystack, usage)) score += 4;
  }

  if (profile.projection && profile.projection !== "unknown") {
    if (contains(haystack, profile.projection)) score += 4;
  }

  if (profile.longevity && profile.longevity !== "unknown") {
    if (contains(haystack, profile.longevity)) score += 4;
  }

  if (profile.age_group && profile.age_group !== "unknown") {
    if (contains(haystack, profile.age_group)) score += 3;
  }

  for (const style of profile.image_style || []) {
    if (contains(haystack, style)) score += 3;
  }

  for (const ex of profile.exclude_tags || []) {
    if (contains(haystack, ex)) score -= 7;
  }

  return score;
}

module.exports = {
  scoreCandidate,
  normalizeGenderValue,
};