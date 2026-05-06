const { getAllPerfumes } = require("./catalogRepo");
const {
  normalizePhrase,
  getExplicitRequestedNoteDetails,
  getExactNoteTerms,
  extractStyleTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

/**
 * V11 exact note search.
 *
 * Головна ціль:
 * - якщо користувач просить конкретну ноту ("кавун", "імбир", "мед", "фіалка"),
 *   спочатку повернути ВСІ аромати, де ця нота реально є в полі notes;
 * - name/version/keywords не мають перебивати notes;
 * - "унісекс" піднімаємо вище тільки серед реальних збігів по нотах;
 * - fallback по keywords/name/version допускається тільки якщо в notes взагалі нічого не знайдено.
 */

const DEFAULT_LIMIT = 30;

function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function normalizeForExact(value) {
  return normalizePhrase(String(value || ""))
    // Важливо: коми, крапки, двокрапки, переноси рядків і лапки мають бути межами слів.
    .replace(/[`'ʼ’‘"“”«»]/g, " ")
    .replace(/[.,;:!?()[\]{}<>|/\\+=*_~№#@$%^&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExactTerm(text, term) {
  const h = ` ${normalizeForExact(text)} `;
  const n = normalizeForExact(term);
  if (!n) return false;

  // Для фраз типу "червона слива", "рожевий перець".
  if (n.includes(" ")) {
    return h.includes(` ${n} `);
  }

  // Однослівна нота: не даємо "ром" збігатися з "ромашка".
  return h.includes(` ${n} `);
}

function matchedTerms(text, terms) {
  const out = [];
  for (const term of terms || []) {
    if (containsExactTerm(text, term)) out.push(normalizeForExact(term));
  }
  return uniq(out);
}

function getRowGender(row) {
  return row.gender ?? row.for_whom ?? row.sex ?? row.target_gender ?? "";
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

function textByFields(row, fields) {
  return fields.map((f) => row?.[f]).filter(Boolean).join(" | ");
}

function styleBonus(row, styleTerms = []) {
  if (!styleTerms.length) return { score: 0, matched: [] };

  const haystack = textByFields(row, ["keywords", "type", "description", "short_desc"]);
  const matched = styleTerms.filter((term) => containsExactTerm(haystack, term));

  return {
    score: matched.length * 80,
    matched: uniq(matched),
  };
}

function buildRequestedTerms(rawText) {
  const noteDetails = getExplicitRequestedNoteDetails(rawText);
  const canonicalNotes = uniq(noteDetails.map((x) => x.canonical));

  const exactTerms = uniq(
    canonicalNotes
      .flatMap((canonical) => getExactNoteTerms(canonical))
      .concat(noteDetails.map((x) => x.term || x.matched || x.raw).filter(Boolean)),
  );

  return { noteDetails, canonicalNotes, exactTerms };
}

function scoreItem(row, data) {
  const itemGender = normalizeGenderValue(getRowGender(row));
  const unisexBonus = itemGender === "unisex" ? 120 : 0;
  const sBonus = styleBonus(row, data.styleTerms);

  return (
    data.baseScore +
    data.matchedInNotes.length * 1200 +
    data.matchedInKeywords.length * 180 +
    data.matchedInNameVersion.length * 80 +
    sBonus.score +
    unisexBonus -
    Number(row.id || 0) * 0.01
  );
}

function formatItem(row, data) {
  const sBonus = styleBonus(row, data.styleTerms);
  const shownTerms = uniq([
    ...data.matchedInNotes,
    ...data.matchedInKeywords,
    ...data.matchedInNameVersion,
  ]).slice(0, 8);

  const why = [];

  if (data.matchedInNotes.length) {
    why.push(`точний збіг ноти: ${uniq(data.matchedInNotes).join(", ")}`);
  } else if (data.matchedInKeywords.length) {
    why.push(`точний збіг ноти/слова в keywords: ${uniq(data.matchedInKeywords).join(", ")}`);
  } else if (data.matchedInNameVersion.length) {
    why.push(`збіг у назві/версії: ${uniq(data.matchedInNameVersion).join(", ")}`);
  }

  if (sBonus.matched.length) {
    why.push(`додатково збігається стиль: ${sBonus.matched.join(", ")}`);
  }

  return {
    ...row,
    match_score: scoreItem(row, data),
    match_bucket: data.bucket,
    direct_match_field: data.matchedInNotes.length ? "ноти" : data.matchedInKeywords.length ? "ключові слова" : "назва/версія",
    direct_match_type: "exact_note",
    why_selected: why.length ? why : [`точний збіг: ${shownTerms.join(", ")}`],
    _debug: {
      ...(row._debug || {}),
      exactNoteSearchV11: {
        canonicalNotes: data.canonicalNotes,
        exactTerms: data.exactTerms.slice(0, 60),
        matchedInNotes: data.matchedInNotes,
        matchedInKeywords: data.matchedInKeywords,
        matchedInNameVersion: data.matchedInNameVersion,
        bucket: data.bucket,
      },
    },
  };
}

function findExactNoteMatches(userTextOrProfile, options = {}) {
  const limit = Math.min(Number(options.limit || process.env.SEARCH_LIMIT_CANDIDATES || DEFAULT_LIMIT), DEFAULT_LIMIT);
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

  const { noteDetails, canonicalNotes, exactTerms } = buildRequestedTerms(rawText);
  if (!noteDetails.length || !exactTerms.length) return [];

  const styleTerms = extractStyleTerms(rawText);
  const rows = getAllPerfumes(Number(process.env.SEARCH_MAX_ROWS_SCAN || 5000))
    .filter((row) => genderAllowed(getRowGender(row), requestedGender));

  const prepared = rows.map((row) => {
    const notesText = textByFields(row, ["notes"]);
    const keywordsText = textByFields(row, ["keywords", "type"]);
    const nameVersionText = textByFields(row, ["name", "version"]);

    return {
      row,
      matchedInNotes: matchedTerms(notesText, exactTerms),
      matchedInKeywords: matchedTerms(keywordsText, exactTerms),
      matchedInNameVersion: matchedTerms(nameVersionText, exactTerms),
    };
  });

  // Найголовніше: якщо є хоч один збіг у notes, повертаємо саме всі notes-збіги.
  // Не змішуємо їх з "фруктовий/квітковий" або name/version.
  const notesMatches = prepared
    .filter((x) => x.matchedInNotes.length)
    .map((x) => formatItem(x.row, {
      canonicalNotes,
      exactTerms,
      styleTerms,
      matchedInNotes: x.matchedInNotes,
      matchedInKeywords: x.matchedInKeywords,
      matchedInNameVersion: x.matchedInNameVersion,
      bucket: "exact_note_notes",
      baseScore: 20000,
    }));

  const source = notesMatches.length
    ? notesMatches
    : prepared
        .filter((x) => x.matchedInKeywords.length || x.matchedInNameVersion.length)
        .map((x) => formatItem(x.row, {
          canonicalNotes,
          exactTerms,
          styleTerms,
          matchedInNotes: x.matchedInNotes,
          matchedInKeywords: x.matchedInKeywords,
          matchedInNameVersion: x.matchedInNameVersion,
          bucket: x.matchedInKeywords.length ? "exact_note_keywords" : "exact_note_name_version",
          baseScore: x.matchedInKeywords.length ? 12000 : 9000,
        }));

  const items = source
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      const ag = normalizeGenderValue(getRowGender(a)) === "unisex" ? 0 : 1;
      const bg = normalizeGenderValue(getRowGender(b)) === "unisex" ? 0 : 1;
      if (ag !== bg) return ag - bg;

      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);

  if (process.env.SEARCH_DEBUG === "1") {
    console.log("[exactNoteSearch:v11]", {
      rawText,
      requestedGender,
      canonicalNotes,
      exactTerms: exactTerms.slice(0, 60),
      rows: rows.length,
      notesMatches: notesMatches.length,
      returned: items.length,
      returnedCodes: items.map((x) => x.number_code || x.code || x.id),
    });
  }

  return items;
}

module.exports = {
  findExactNoteMatches,
  normalizeForExact,
  containsExactTerm,
};
