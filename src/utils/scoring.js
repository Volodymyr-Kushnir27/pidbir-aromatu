const { norm } = require("./text");

function contains(haystack, needle) {
  return norm(haystack).includes(norm(needle));
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
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  if (profile.gender && profile.gender !== "unknown") {
    if (contains(haystack, profile.gender)) score += 12;
  }

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

  for (const ex of profile.exclude_tags || []) {
    if (contains(haystack, ex)) score -= 7;
  }

  return score;
}

module.exports = {
  scoreCandidate,
};