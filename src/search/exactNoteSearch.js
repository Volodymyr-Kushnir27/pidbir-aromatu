const { getAllPerfumes } = require("./catalogRepo");
const {
  norm,
  containsPhrase,
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

function textForNoteSearch(row) {
  // Exact note search must primarily use notes, not version/name, to avoid false positives like "габа" inside "Габана".
  return norm([row.notes, row.keywords, row.accords].filter(Boolean).join(" | "));
}

function containsTerm(text, term) {
  return containsPhrase(text, term);
}

function matchedTerms(text, terms = []) {
  return [...new Set((terms || []).filter((term) => containsTerm(text, term)))];
}


// AUX_STYLE_TERMS_FOR_NOTE_SEARCH
// Стильові слова використовуються тільки як бонус після точного збігу ноти.
// Вони не можуть витісняти ноту і не повинні запускати direct-search.
const AUX_STYLE_GROUPS = {
  trail: ["шлейфовий", "шлейфова", "шлейфове", "шлейфові", "шлейф", "sillage", "projection", "trail"],
  sweet: ["солодкий", "солодка", "солодке", "солодкі", "сладкий", "sweet", "gourmand"],
  fresh: ["свіжий", "свіжа", "свіже", "свіжі", "свежий", "fresh", "clean"],
  spicy: ["пряний", "пряна", "пряне", "пряні", "spicy", "warm spicy"],
  woody: ["деревний", "деревна", "деревне", "woody", "wood"],
  floral: ["квітковий", "квіткова", "квіткове", "цветочный", "floral"],
};

function getAuxStyleTerms(rawText) {
  const text = norm(rawText || "");
  const out = [];
  for (const terms of Object.values(AUX_STYLE_GROUPS)) {
    const matched = terms.some((term) => containsTerm(text, term));
    if (matched) out.push(...terms);
  }
  return [...new Set(out)];
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
  const limit = Math.min(Number(options.limit || process.env.SEARCH_LIMIT_CANDIDATES || 30), 30);
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

  const exactTerms = [...new Set(canonicalNotes.flatMap(getExactNoteTerms))];
  const fallbackTerms = [...new Set(canonicalNotes.flatMap(getFallbackNoteTerms))];
  const rows = getAllPerfumes(2000).filter((row) => genderAllowed(row.gender, requestedGender));

  const exactRows = rows
    .map((row) => {
      const haystack = textForNoteSearch(row);
      const exactMatched = matchedTerms(haystack, exactTerms);
      if (!exactMatched.length) return null;
      const fallbackMatched = matchedTerms(haystack, fallbackTerms);
      const itemGender = normalizeGenderValue(row.gender);
      const unisexBonus = itemGender === "unisex" ? 350 : 0;
      const notesOnly = norm(row.notes || "");
      const inNotesBonus = exactMatched.some((t) => containsTerm(notesOnly, t)) ? 10000 : 0;

      return {
        ...row,
        match_score: 1000 + inNotesBonus + exactMatched.length * 150 + fallbackMatched.length * 20 + unisexBonus,
        match_bucket: "exact_note",
        direct_match_field: "ноти",
        direct_match_type: "exact_note",
        why_selected: [
          `точний збіг ноти: ${exactMatched.slice(0, 5).join(", ")}`,
        ],
        _debug: {
          ...(row._debug || {}),
          exactNoteSearch: {
            canonicalNotes,
            exactTerms: exactMatched,
            fallbackTerms: fallbackMatched,
            unisexBonus,
            inNotesBonus,
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

  if (String(process.env.SEARCH_DEBUG || "0") === "1") {
    console.log("[exactNoteSearch]", {
      rawText,
      requestedGender,
      canonicalNotes,
      exactTerms,
      fallbackTerms,
      rows: rows.length,
      returned: exactRows.length,
      ids: exactRows.map((x) => x.id),
    });
  }

  return exactRows;
}

module.exports = {
  findExactNoteMatches,
};
