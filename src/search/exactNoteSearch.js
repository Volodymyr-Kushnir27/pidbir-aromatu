const { getAllPerfumes } = require("./catalogRepo");
const {
  norm,
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

function normalizeSearchText(value) {
  return ` ${norm(value)
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function textParts(row) {
  return {
    name: normalizeSearchText(row.name),
    version: normalizeSearchText(row.version),
    keywords: normalizeSearchText(row.keywords),
    notes: normalizeSearchText(row.notes),
    accords: normalizeSearchText(row.accords),
    description: normalizeSearchText([row.description, row.short_desc].filter(Boolean).join(" ")),
  };
}

function containsTerm(text, term) {
  const h = normalizeSearchText(text);
  const p = normalizeSearchText(term).trim();
  if (!p) return false;
  return h.includes(` ${p} `);
}

function matchedTermsInPart(partText, terms = []) {
  return terms.filter((term) => containsTerm(partText, term));
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

function scoreExactNoteRow(row, canonicalNotes, exactTerms, fallbackTerms) {
  const parts = textParts(row);

  const exactNotes = matchedTermsInPart(parts.notes, exactTerms);
  const exactKeywords = matchedTermsInPart(parts.keywords, exactTerms);
  const exactVersion = matchedTermsInPart(parts.version, exactTerms);
  const exactName = matchedTermsInPart(parts.name, exactTerms);
  const exactDescription = matchedTermsInPart(parts.description, exactTerms);
  const exactAccords = matchedTermsInPart(parts.accords, exactTerms);

  const allExact = [
    ...exactNotes,
    ...exactKeywords,
    ...exactVersion,
    ...exactName,
    ...exactDescription,
    ...exactAccords,
  ];

  if (!allExact.length) return null;

  const fallback = [
    ...matchedTermsInPart(parts.notes, fallbackTerms),
    ...matchedTermsInPart(parts.keywords, fallbackTerms),
    ...matchedTermsInPart(parts.version, fallbackTerms),
    ...matchedTermsInPart(parts.description, fallbackTerms),
    ...matchedTermsInPart(parts.accords, fallbackTerms),
  ];

  const itemGender = normalizeGenderValue(row.gender);
  const unisexBonus = itemGender === "unisex" ? 75 : 0;

  let score = 10000;
  score += exactNotes.length * 900;
  score += exactKeywords.length * 650;
  score += exactVersion.length * 520;
  score += exactName.length * 420;
  score += exactDescription.length * 180;
  score += exactAccords.length * 120;
  score += fallback.length * 20;
  score += unisexBonus;

  const bestField = exactNotes.length
    ? "ноти"
    : exactKeywords.length
      ? "ключові слова"
      : exactVersion.length
        ? "версія"
        : exactName.length
          ? "назва"
          : "опис/напрям";

  return {
    ...row,
    match_score: score,
    match_bucket: "exact_note",
    direct_match_field: bestField,
    direct_match_type: "exact_note",
    why_selected: [
      `точний збіг ноти: ${[...new Set(allExact)].slice(0, 5).join(", ")}`,
      itemGender === "unisex" ? "унісекс варіант піднято вище, бо він збігається по ноті" : "",
    ].filter(Boolean),
    _debug: {
      ...(row._debug || {}),
      exactNoteSearch: {
        canonicalNotes,
        exactNotes,
        exactKeywords,
        exactVersion,
        exactName,
        exactDescription,
        exactAccords,
        fallback,
        unisexBonus,
      },
    },
  };
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

  const rows = getAllPerfumes(1000).filter((row) => genderAllowed(row.gender, requestedGender));

  const exactRows = rows
    .map((row) => scoreExactNoteRow(row, canonicalNotes, exactTerms, fallbackTerms))
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
