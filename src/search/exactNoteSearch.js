const { getAllPerfumes } = require("./catalogRepo");
const {
  norm,
  normalizePhrase,
  containsPhrase,
  getExplicitRequestedNoteDetails,
  getExactNoteTerms,
  extractStyleTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

function textForNoteSearch(row) {
  return [
    row.notes,
    row.keywords,
    row.type,
    row.name,
    row.version,
    row.description,
    row.short_desc,
  ].filter(Boolean).join(" | ");
}

function fieldText(row, field) {
  return String(row?.[field] || "");
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

function countMatchedTerms(text, terms = []) {
  const matched = [];
  for (const term of terms || []) {
    if (containsPhrase(text, term)) matched.push(term);
  }
  return matched;
}

function styleBonus(row, styleTerms = []) {
  if (!styleTerms.length) return { score: 0, matched: [] };
  const haystack = [row.keywords, row.type, row.description, row.short_desc].filter(Boolean).join(" | ");
  const matched = styleTerms.filter((term) => containsPhrase(haystack, term));
  return { score: matched.length * 80, matched };
}

function findExactNoteMatches(userTextOrProfile, options = {}) {
  const limit = Math.min(Number(options.limit || process.env.SEARCH_LIMIT_CANDIDATES || 30), 30);
  const requestedGender = options.gender || userTextOrProfile?.gender || null;

  const rawText = typeof userTextOrProfile === "string"
    ? userTextOrProfile
    : [
        ...(userTextOrProfile?.notes_include || []),
        ...(userTextOrProfile?.notes_prefer || []),
        ...(userTextOrProfile?.raw_terms || []),
        userTextOrProfile?.query,
        userTextOrProfile?.text,
      ].filter(Boolean).join(" ");

  const noteDetails = getExplicitRequestedNoteDetails(rawText);
  if (!noteDetails.length) return [];

  const canonicalNotes = noteDetails.map((x) => x.canonical);
  const exactTerms = canonicalNotes.flatMap(getExactNoteTerms);
  const requestedStyleTerms = extractStyleTerms(rawText);

  const rows = getAllPerfumes(2000).filter((row) => genderAllowed(row.gender, requestedGender));

  const items = rows
    .map((row) => {
      const notesText = fieldText(row, "notes");
      const keywordsText = fieldText(row, "keywords");
      const nameVersionText = [row.name, row.version].filter(Boolean).join(" | ");
      const allText = textForNoteSearch(row);

      const matchedInNotes = countMatchedTerms(notesText, exactTerms);
      const matchedInKeywords = countMatchedTerms(keywordsText, exactTerms);
      const matchedInNameVersion = countMatchedTerms(nameVersionText, exactTerms);
      const matchedAnywhere = countMatchedTerms(allText, exactTerms);

      // Головне правило: якщо конкретна нота є в БД, пріоритет тільки точній ноті.
      // Не дозволяємо загальним напрямам типу "фруктовий/квітковий/шлейфовий" заміняти ноту.
      if (!matchedAnywhere.length) return null;

      const itemGender = normalizeGenderValue(row.gender);
      const unisexBonus = itemGender === "unisex" ? 120 : 0;
      const sBonus = styleBonus(row, requestedStyleTerms);

      const score =
        10000 +
        matchedInNotes.length * 900 +
        matchedInKeywords.length * 220 +
        matchedInNameVersion.length * 120 +
        sBonus.score +
        unisexBonus -
        Number(row.id || 0) * 0.01;

      const shownTerms = [...new Set(matchedAnywhere)].slice(0, 6);
      const why = [`точний збіг ноти: ${shownTerms.join(", ")}`];
      if (sBonus.matched.length) {
        why.push(`додатково збігається стиль: ${[...new Set(sBonus.matched)].join(", ")}`);
      }

      return {
        ...row,
        match_score: score,
        match_bucket: "exact_note",
        direct_match_field: "ноти",
        direct_match_type: "exact_note",
        why_selected: why,
        _debug: {
          ...(row._debug || {}),
          exactNoteSearch: {
            canonicalNotes,
            exactTerms: shownTerms,
            matchedInNotes,
            matchedInKeywords,
            matchedInNameVersion,
            styleTerms: sBonus.matched,
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

  if (process.env.SEARCH_DEBUG === "1") {
    console.log("[exactNoteSearch]", {
      rawText,
      requestedGender,
      canonicalNotes,
      exactTerms: [...new Set(exactTerms)].slice(0, 30),
      styleTerms: requestedStyleTerms,
      rows: rows.length,
      returned: items.length,
      ids: items.map((x) => x.id),
    });
  }

  return items;
}

module.exports = {
  findExactNoteMatches,
};
