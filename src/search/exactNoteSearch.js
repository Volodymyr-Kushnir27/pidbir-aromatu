const { getAllPerfumes } = require("./catalogRepo");
const {
  normalizePhrase,
  getExplicitRequestedNoteDetails,
  getExactNoteTerms,
  extractStyleTerms,
} = require("./queryNormalizer");
const { normalizeGenderValue } = require("./candidateSearch");

const DEFAULT_LIMIT = 30;

function uniq(list) {
  return [...new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function normalizeForExact(value) {
  return normalizePhrase(String(value || ""))
    .replace(/[`'ʼ’‘"“”«»]/g, " ")
    .replace(/[.,;:!?()[\]{}<>|/\\+=*_~№#@$%^&\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExactTerm(text, term) {
  const h = ` ${normalizeForExact(text)} `;
  const n = normalizeForExact(term);
  if (!n) return false;
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
  const matched = uniq(styleTerms.filter((term) => containsExactTerm(haystack, term)));
  return { score: matched.length * 60, matched };
}

function addHardAliases(rawText, canonicalNotes, exactTerms) {
  const t = normalizeForExact(rawText);

  const pushGroup = (canonical, terms) => {
    if (!canonicalNotes.includes(canonical)) canonicalNotes.push(canonical);
    for (const term of terms) exactTerms.push(term);
  };

  // Українські/російські відмінки й часті помилки, які часто не ловить автогенерація.
  if (/(^| )(кавун|кавуна|кавуну|кавуном|кавуновий|арбуз|арбуза|арбузу|арбузом|watermelon|water melon)( |$)/i.test(t)) {
    pushGroup("watermelon", ["кавун", "кавуна", "кавуну", "кавуном", "кавуновий", "арбуз", "арбуза", "арбузу", "арбузом", "арбузный", "watermelon", "water melon"]);
  }
  if (/(^| )(диня|дині|диню|динею|динєю|дыня|дыни|дыню|melon)( |$)/i.test(t)) {
    pushGroup("melon", ["диня", "дині", "диню", "динею", "дыня", "дыни", "дыню", "melon"]);
  }
  if (/(^| )(імбир|імбиру|імбиром|імбирь|имбирь|имбир|ginger)( |$)/i.test(t)) {
    pushGroup("ginger", ["імбир", "імбиру", "імбиром", "імбирний", "імбирь", "имбир", "имбирь", "ginger", "заморожений імбир", "квітка імбиру"]);
  }
  if (/(^| )(слива|сливи|сливу|сливою|plum)( |$)/i.test(t)) {
    pushGroup("plum", ["слива", "сливи", "сливу", "сливою", "червона слива", "plum", "red plum"]);
  }
  if (/(^| )(мед|меду|медом|медовий|honey)( |$)/i.test(t)) {
    pushGroup("honey", ["мед", "меду", "медом", "медовий", "білий мед", "honey"]);
  }
  if (/(^| )(фіалка|фіалки|фіалку|фіалкою|фиалка|violet)( |$)/i.test(t)) {
    pushGroup("violet", ["фіалка", "фіалки", "фіалку", "фіалкою", "фіалковий акорд", "листя фіалки", "аркуш фіалки", "violet", "violet leaf"]);
  }
  if (/(^| )(м'?ята|м’ята|мята|м'яти|м’яти|мяти|mint|peppermint)( |$)/i.test(t)) {
    pushGroup("mint", ["м'ята", "м’ята", "мята", "м'яти", "м’яти", "мяти", "м'ятою", "м’ятою", "мятою", "заморожена м'ята", "mint", "peppermint"]);
  }
  if (/(^| )(вишня|вишні|вишню|вишнею|cherry)( |$)/i.test(t)) {
    pushGroup("cherry", ["вишня", "вишні", "вишню", "вишнею", "вишневий", "cherry", "black cherry", "sweet cherry"]);
  }

  // EXACT_NOTE_ALIASES_V18
  // Додаткові фруктові/зелені ноти, які продавці часто вводять у відмінках.
  if (/(^| )(полуниця|полуниці|полуницю|полуницею|клубника|клубники|клубнику|клубникой|strawberry|strawberries)( |$)/i.test(t)) {
    pushGroup("strawberry", ["полуниця", "полуниці", "полуницю", "полуницею", "клубника", "клубники", "клубнику", "клубникой", "strawberry", "strawberries"]);
  }
  if (/(^| )(маракуя|маракуї|маракую|маракуєю|маракуйя|маракуйи|маракуйю|passion fruit|passionfruit|passion)( |$)/i.test(t)) {
    pushGroup("passionfruit", ["маракуя", "маракуї", "маракую", "маракуєю", "маракуйя", "маракуйи", "маракуйю", "passion fruit", "passionfruit"]);
  }
  if (/(^| )(базилік|базиліку|базиліком|базилик|базилика|базиликом|basil)( |$)/i.test(t)) {
    pushGroup("basil", ["базилік", "базиліку", "базиліком", "базилик", "базилика", "базиликом", "basil"]);
  }
  if (/(^| )(гарбуз|гарбуза|гарбузу|гарбузом|тыква|тыквы|тыкву|тыквой|pumpkin)( |$)/i.test(t)) {
    pushGroup("pumpkin", ["гарбуз", "гарбуза", "гарбузу", "гарбузом", "тыква", "тыквы", "тыкву", "тыквой", "pumpkin"]);
  }
  if (/(^| )(яблуко|яблука|яблуком|яблуку|яблоко|яблока|яблоком|apple)( |$)/i.test(t)) {
    pushGroup("apple", ["яблуко", "яблука", "яблуком", "яблуку", "яблоко", "яблока", "яблоком", "apple", "green apple", "зелене яблуко", "червоне яблуко"]);
  }
  if (/(^| )(груша|груші|грушу|грушею|груши|грушу|pear)( |$)/i.test(t)) {
    pushGroup("pear", ["груша", "груші", "грушу", "грушею", "груши", "pear"]);
  }

  if (/(^| )(ром|рому|ромом|rum|віскі|виски|whisky|whiskey|bourbon|scotch)( |$)/i.test(t)) {
    pushGroup("alcohol", ["ром", "рому", "ромом", "rum", "віскі", "виски", "whisky", "whiskey", "bourbon", "scotch", "коньяк", "коньяку", "коньяком", "cognac", "brandy", "лікер", "liqueur", "горілка", "vodka", "вино", "wine", "шампанське", "champagne"]);
  }

  return { canonicalNotes: uniq(canonicalNotes), exactTerms: uniq(exactTerms) };
}

function buildRequestedTerms(rawText) {
  const noteDetails = getExplicitRequestedNoteDetails(rawText);
  let canonicalNotes = uniq(noteDetails.map((x) => x.canonical));
  let exactTerms = uniq(
    canonicalNotes
      .flatMap((canonical) => getExactNoteTerms(canonical))
      .concat(noteDetails.flatMap((x) => [x.term, x.matched, x.raw, ...(x.terms || [])]).filter(Boolean)),
  );
  return addHardAliases(rawText, canonicalNotes, exactTerms);
}

function scoreItem(row, data) {
  const itemGender = normalizeGenderValue(getRowGender(row));
  const unisexBonus = itemGender === "unisex" ? 120 : 0;
  const sBonus = styleBonus(row, data.styleTerms);
  return (
    data.baseScore +
    data.matchedInNotes.length * 1400 +
    data.matchedInKeywords.length * 120 +
    data.matchedInNameVersion.length * 50 +
    sBonus.score +
    unisexBonus -
    Number(row.id || 0) * 0.01
  );
}

function formatItem(row, data) {
  const sBonus = styleBonus(row, data.styleTerms);
  const why = [];
  if (data.matchedInNotes.length) why.push(`точний збіг ноти: ${uniq(data.matchedInNotes).join(", ")}`);
  else if (data.matchedInKeywords.length) why.push(`точний збіг ноти/слова в keywords: ${uniq(data.matchedInKeywords).join(", ")}`);
  else if (data.matchedInNameVersion.length) why.push(`збіг у назві/версії: ${uniq(data.matchedInNameVersion).join(", ")}`);
  if (sBonus.matched.length) why.push(`додатково збігається стиль: ${sBonus.matched.join(", ")}`);

  return {
    ...row,
    match_score: scoreItem(row, data),
    match_bucket: data.bucket,
    direct_match_field: data.matchedInNotes.length ? "ноти" : data.matchedInKeywords.length ? "ключові слова" : "назва/версія",
    direct_match_type: "exact_note",
    why_selected: why,
    _debug: {
      ...(row._debug || {}),
      exactNoteSearchV12: {
        canonicalNotes: data.canonicalNotes,
        exactTerms: data.exactTerms.slice(0, 80),
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

  const { canonicalNotes, exactTerms } = buildRequestedTerms(rawText);
  if (!canonicalNotes.length || !exactTerms.length) return [];

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

  const notesMatches = prepared
    .filter((x) => x.matchedInNotes.length)
    .map((x) => formatItem(x.row, {
      canonicalNotes, exactTerms, styleTerms,
      matchedInNotes: x.matchedInNotes,
      matchedInKeywords: x.matchedInKeywords,
      matchedInNameVersion: x.matchedInNameVersion,
      bucket: "exact_note_notes",
      baseScore: 20000,
    }));

  const fallbackMatches = prepared
    .filter((x) => x.matchedInKeywords.length || x.matchedInNameVersion.length)
    .map((x) => formatItem(x.row, {
      canonicalNotes, exactTerms, styleTerms,
      matchedInNotes: x.matchedInNotes,
      matchedInKeywords: x.matchedInKeywords,
      matchedInNameVersion: x.matchedInNameVersion,
      bucket: x.matchedInKeywords.length ? "exact_note_keywords" : "exact_note_name_version",
      baseScore: x.matchedInKeywords.length ? 12000 : 9000,
    }));

  const source = notesMatches.length ? notesMatches : fallbackMatches;
  const items = source.sort((a, b) => {
    const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
    if (diff !== 0) return diff;
    const ag = normalizeGenderValue(getRowGender(a)) === "unisex" ? 0 : 1;
    const bg = normalizeGenderValue(getRowGender(b)) === "unisex" ? 0 : 1;
    if (ag !== bg) return ag - bg;
    return Number(a.id || 0) - Number(b.id || 0);
  }).slice(0, limit);

  if (process.env.SEARCH_DEBUG === "1") {
    console.log("[exactNoteSearch:v12]", {
      rawText,
      requestedGender,
      canonicalNotes,
      exactTerms: exactTerms.slice(0, 80),
      rows: rows.length,
      notesMatches: notesMatches.length,
      fallbackMatches: fallbackMatches.length,
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
