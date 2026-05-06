const { getAllPerfumes } = require("./catalogRepo");
const {
  norm,
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

function textForNoteSearch(row) {
  return norm([
    row.name,
    row.version,
    row.keywords,
    row.notes,
    row.accords,
    row.description,
    row.short_desc,
  ].filter(Boolean).join(" | ")).replace(/[ʼ’‘`´']/g, " ");
}

function containsTerm(text, term) {
  const h = ` ${norm(text).replace(/[ʼ’‘`´']/g, " ")} `;
  const p = ` ${norm(term).replace(/[ʼ’‘`´']/g, " ")} `;
  return h.includes(p);
}

function countTerms(text, terms = []) {
  return terms.filter((term) => containsTerm(text, term)).length;
}

function genderAllowed(rowGender, requestedGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(rowGender);
  if (!req || req === "unknown") return true;
  if (req === "female") return item === "female" || item === "unisex";
  if (req === "male") return item === "male" || item === "unisex";
  if (req === "unisex") return item === "unisex";
  return true;
}

function findExactNoteMatches(userTextOrProfile, options = {}) {
  const limit = Number(options.limit || 30);
  const requestedGender = options.gender || userTextOrProfile?.gender || null;

  const rawText = typeof userTextOrProfile === "string"
    ? userTextOrProfile
    : [
        ...(userTextOrProfile?.notes_include || []),
        ...(userTextOrProfile?.notes_prefer || []),
        ...(userTextOrProfile?.raw_terms || []),
      ].join(" ");

  const canonicalNotes = getExplicitRequestedNotes(rawText);
  if (!canonicalNotes.length) return [];

  const exactTerms = canonicalNotes.flatMap(getExactNoteTerms);
  const fallbackTerms = canonicalNotes.flatMap(getFallbackNoteTerms);

  const rows = getAllPerfumes(1000).filter((row) => genderAllowed(row.gender, requestedGender));

  const exactRows = rows
    .map((row) => {
      const haystack = textForNoteSearch(row);
      const exactCount = countTerms(haystack, exactTerms);
      const fallbackCount = countTerms(haystack, fallbackTerms);
      if (!exactCount) return null;

      const itemGender = normalizeGenderValue(row.gender);
      const unisexBonus = itemGender === "unisex" ? 25 : 0;

      return {
        ...row,
        match_score: 1000 + exactCount * 150 + fallbackCount * 20 + unisexBonus,
        match_bucket: "exact_note",
        direct_match_field: "ноти/ключові слова",
        direct_match_type: "exact_note",
        why_selected: [
          `точний збіг ноти: ${exactTerms.filter((t) => containsTerm(haystack, t)).slice(0, 4).join(", ")}`,
        ],
        _debug: {
          ...(row._debug || {}),
          exactNoteSearch: {
            canonicalNotes,
            exactTerms: exactTerms.filter((t) => containsTerm(haystack, t)),
            fallbackTerms: fallbackTerms.filter((t) => containsTerm(haystack, t)),
            unisexBonus,
          },
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;
      const ag = normalizeGenderValue(a.gender) === "unisex" ? 0 : 1;
      const bg = normalizeGenderValue(b.gender) === "unisex" ? 0 : 1;
      if (ag !== bg) return ag - bg;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);

  return exactRows;
}

module.exports = {
  findExactNoteMatches,
};
