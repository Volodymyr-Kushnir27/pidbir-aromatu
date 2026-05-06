const { getAllPerfumes } = require("./catalogRepo");
const { scoreCandidate } = require("../utils/scoring");
const { norm, uniq } = require("../utils/text");
const {
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
} = require("./queryNormalizer");

const NOTE_SYNONYMS = {
  кавун: ["кавун", "арбуз", "watermelon", "water melon"],
  арбуз: ["кавун", "арбуз", "watermelon", "water melon"],
  watermelon: ["кавун", "арбуз", "watermelon", "water melon"],

  диня: ["диня", "дыня", "melon"],
  дыня: ["диня", "дыня", "melon"],
  melon: ["диня", "дыня", "melon"],

  вишня: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],
  cherry: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],

  полуниця: ["полуниця", "клубника", "strawberry"],
  клубника: ["полуниця", "клубника", "strawberry"],
  strawberry: ["полуниця", "клубника", "strawberry"],

  малина: ["малина", "raspberry"],
  raspberry: ["малина", "raspberry"],

  персик: ["персик", "peach"],
  peach: ["персик", "peach"],

  яблуко: ["яблуко", "яблоко", "apple", "green apple", "red apple"],
  яблоко: ["яблуко", "яблоко", "apple", "green apple", "red apple"],
  apple: ["яблуко", "яблоко", "apple", "green apple", "red apple"],

  груша: ["груша", "pear"],
  pear: ["груша", "pear"],

  лимон: ["лимон", "lemon", "citron"],
  lemon: ["лимон", "lemon", "citron"],

  бергамот: ["бергамот", "bergamot"],
  bergamot: ["бергамот", "bergamot"],

  апельсин: ["апельсин", "orange", "mandarin", "tangerine"],
  orange: ["апельсин", "orange", "mandarin", "tangerine"],

  ваніль: ["ваніль", "ваниль", "vanilla"],
  ваниль: ["ваніль", "ваниль", "vanilla"],
  vanilla: ["ваніль", "ваниль", "vanilla"],

  мускус: ["мускус", "musk", "white musk"],
  musk: ["мускус", "musk", "white musk"],

  кедр: ["кедр", "cedar", "cedarwood"],
  cedar: ["кедр", "cedar", "cedarwood"],

  сандал: ["сандал", "sandal", "sandalwood"],
  sandal: ["сандал", "sandal", "sandalwood"],
  sandalwood: ["сандал", "sandal", "sandalwood"],

  троянда: ["троянда", "роза", "rose"],
  роза: ["троянда", "роза", "rose"],
  rose: ["троянда", "роза", "rose"],

  жасмин: ["жасмин", "jasmine"],
  jasmine: ["жасмин", "jasmine"],

  лаванда: ["лаванда", "lavender"],
  lavender: ["лаванда", "lavender"],

  шкіра: ["шкіра", "кожа", "leather"],
  кожа: ["шкіра", "кожа", "leather"],
  leather: ["шкіра", "кожа", "leather"],

  тютюн: ["тютюн", "табак", "tobacco"],
  табак: ["тютюн", "табак", "tobacco"],
  tobacco: ["тютюн", "табак", "tobacco"],

  кава: ["кава", "кофе", "coffee", "espresso"],
  кофе: ["кава", "кофе", "coffee", "espresso"],
  coffee: ["кава", "кофе", "coffee", "espresso"],

  ром: ["ром", "rum", "boozy", "liquor"],
  rum: ["ром", "rum", "boozy", "liquor"],

  кокос: ["кокос", "coconut"],
  coconut: ["кокос", "coconut"],

  ананас: ["ананас", "pineapple"],
  pineapple: ["ананас", "pineapple"],

  смородина: ["смородина", "black currant", "currant", "cassis"],
  cassis: ["смородина", "black currant", "currant", "cassis"],
};

const STYLE_SYNONYMS = {
  свіжий: ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],
  свежий: ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],
  fresh: ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],

  солодкий: ["солодкий", "сладкий", "sweet", "gourmand", "candied"],
  сладкий: ["солодкий", "сладкий", "sweet", "gourmand", "candied"],
  sweet: ["солодкий", "сладкий", "sweet", "gourmand", "candied"],

  фруктовий: ["фруктовий", "фруктовый", "fruity", "juicy"],
  фруктовый: ["фруктовий", "фруктовый", "fruity", "juicy"],
  fruity: ["фруктовий", "фруктовый", "fruity", "juicy"],

  квітковий: ["квітковий", "цветочный", "floral"],
  цветочный: ["квітковий", "цветочный", "floral"],
  floral: ["квітковий", "цветочный", "floral"],

  деревний: ["деревний", "древесный", "woody", "wood"],
  древесный: ["деревний", "древесный", "woody", "wood"],
  woody: ["деревний", "древесный", "woody", "wood"],

  пряний: ["пряний", "пряный", "spicy", "warm spicy"],
  spicy: ["пряний", "пряный", "spicy", "warm spicy"],

  пудровий: ["пудровий", "пудровый", "powdery"],
  powdery: ["пудровий", "пудровый", "powdery"],

  зелений: ["зелений", "зеленый", "green", "herbal"],
  green: ["зелений", "зеленый", "green", "herbal"],

  літній: ["літній", "летний", "summer", "sunny"],
  летний: ["літній", "летний", "summer", "sunny"],
  summer: ["літній", "летний", "summer", "sunny"],

  вечірній: ["вечірній", "вечерный", "evening", "night", "date night"],
  денний: ["денний", "дневной", "daytime", "office", "daily"],
};

const GENDER_SYNONYMS = {
  male: ["male", "man", "men", "чоловічий", "чоловічі", "мужской", "мужские"],
  female: ["female", "woman", "women", "жіночий", "жіночі", "женский", "женские"],
  unisex: ["unisex", "унісекс", "унисекс"],
};

const SEASON_SYNONYMS = {
  spring: ["spring", "весна", "весняний", "весенний"],
  summer: ["summer", "літо", "літній", "лето", "летний"],
  autumn: ["autumn", "fall", "осінь", "осінній", "осень", "осенний"],
  winter: ["winter", "зима", "зимовий", "зимний"],
};

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(String(text || ""));
}

function normalizeText(value) {
  return norm(String(value || "")).replace(/[ʼ’‘`´']/g, " ");
}

function containsTerm(text, term) {
  const h = ` ${normalizeText(text)} `;
  const p = ` ${normalizeText(term)} `;
  return h.includes(p);
}

function expandTerms(terms = [], dict = {}) {
  const out = [];

  for (const term of terms || []) {
    const key = norm(term);
    if (!key) continue;

    out.push(term);

    if (dict[key]) {
      out.push(...dict[key]);
      continue;
    }

    for (const [dictKey, arr] of Object.entries(dict)) {
      if (key.includes(dictKey) || dictKey.includes(key)) out.push(...arr);
    }
  }

  return uniq(out.map((x) => String(x).trim()).filter(Boolean));
}

function expandGender(gender) {
  if (!gender || gender === "unknown") return [];
  return GENDER_SYNONYMS[gender] || [gender];
}

function expandSeason(seasons = []) {
  const out = [];

  for (const s of seasons || []) {
    const key = norm(s);
    if (!key) continue;
    if (SEASON_SYNONYMS[key]) out.push(...SEASON_SYNONYMS[key]);
    else out.push(s);
  }

  return uniq(out);
}

function buildHaystack(row) {
  return normalizeText([
    row.id,
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
    row.version,
  ].filter(Boolean).join(" | "));
}

function countMatches(haystack, terms = []) {
  let count = 0;
  for (const term of terms || []) {
    if (containsTerm(haystack, term)) count += 1;
  }
  return count;
}

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));
  if (!g) return "unknown";

  const hasUnisex = g.includes("унісекс") || g.includes("унисекс") || hasWord(g, "unisex");
  const hasFemale = g.includes("жіноч") || g.includes("женск") || hasWord(g, "female") || hasWord(g, "women") || hasWord(g, "woman");
  const hasMale = g.includes("чолов") || g.includes("мужск") || hasWord(g, "male") || hasWord(g, "men") || hasWord(g, "man");

  if (hasUnisex) return "unisex";
  if (hasFemale && hasMale) return "unisex";
  if (hasFemale) return "female";
  if (hasMale) return "male";
  return "unknown";
}

function buildOntologyContext(profile = {}) {
  const rawTerms = [
    ...(profile.notes_include || []),
    ...(profile.notes_prefer || []),
    ...(profile.notes_include_synonyms || []),
    ...(profile.notes_prefer_synonyms || []),
    ...(profile.raw_terms || []),
  ];

  const exactRequestedNotes = getExplicitRequestedNotes(rawTerms.join(" "));
  const exactNoteTerms = exactRequestedNotes.flatMap(getExactNoteTerms);
  const exactFallbackTerms = exactRequestedNotes.flatMap(getFallbackNoteTerms);

  const noteTerms = expandTerms(rawTerms, NOTE_SYNONYMS);

  const accordTerms = expandTerms([
    ...(profile.accords || []),
    ...(profile.style_tags || []),
    ...(profile.accord_synonyms || []),
    ...(profile.style_synonyms || []),
    ...(profile.raw_terms || []),
  ], STYLE_SYNONYMS);

  const genderTerms = expandGender(profile.gender);
  const seasonTerms = expandSeason(profile.season || []);
  const excludeTerms = expandTerms(profile.exclude_tags || [], { ...NOTE_SYNONYMS, ...STYLE_SYNONYMS });

  return {
    noteTerms,
    accordTerms,
    genderTerms,
    seasonTerms,
    excludeTerms,
    exactRequestedNotes,
    exactNoteTerms,
    exactFallbackTerms,
  };
}

function applyOntologyScore(row, ontology) {
  const haystack = buildHaystack(row);

  const exactNoteMatches = countMatches(haystack, ontology.exactNoteTerms);
  const exactFallbackMatches = countMatches(haystack, ontology.exactFallbackTerms);
  const noteMatches = countMatches(haystack, ontology.noteTerms);
  const accordMatches = countMatches(haystack, ontology.accordTerms);
  const genderMatches = countMatches(haystack, ontology.genderTerms);
  const seasonMatches = countMatches(haystack, ontology.seasonTerms);
  const excludeMatches = countMatches(haystack, ontology.excludeTerms);

  let score = 0;
  score += exactNoteMatches * 1000;
  score += exactFallbackMatches * 25;
  score += noteMatches * 45;
  score += accordMatches * 10;
  score += genderMatches * 7;
  score += seasonMatches * 4;
  score -= excludeMatches * 20;

  const itemGender = normalizeGenderValue(row.gender);
  const hasSimilarity = exactNoteMatches > 0 || noteMatches > 0 || accordMatches > 0;
  const unisexBonus = itemGender === "unisex" && hasSimilarity ? 25 : 0;
  score += unisexBonus;

  return {
    score,
    exactNoteMatches,
    exactFallbackMatches,
    noteMatches,
    accordMatches,
    genderMatches,
    seasonMatches,
    excludeMatches,
    unisexBonus,
  };
}

function buildMatchDebug(row, ontology, expanded) {
  const haystack = buildHaystack(row);

  return {
    exact_requested_notes: ontology.exactRequestedNotes,
    matched_exact_notes: ontology.exactNoteTerms.filter((t) => containsTerm(haystack, t)).slice(0, 8),
    matched_note_fallbacks: ontology.exactFallbackTerms.filter((t) => containsTerm(haystack, t)).slice(0, 8),
    matched_notes: ontology.noteTerms.filter((t) => containsTerm(haystack, t)).slice(0, 8),
    matched_accords: ontology.accordTerms.filter((t) => containsTerm(haystack, t)).slice(0, 8),
    matched_gender: ontology.genderTerms.filter((t) => containsTerm(haystack, t)).slice(0, 4),
    matched_seasons: ontology.seasonTerms.filter((t) => containsTerm(haystack, t)).slice(0, 4),
    unisexBonus: expanded.unisexBonus,
  };
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

function filterRowsByRequestedGender(rows, requestedGender) {
  return rows.filter((row) => genderAllowed(row.gender, requestedGender));
}

function findCandidates(searchProfile = {}, limit = 30) {
  const hardLimit = Math.min(Number(limit || 30), Number(process.env.SEARCH_LIMIT_CANDIDATES || 30));
  const rows = getAllPerfumes();
  const ontology = buildOntologyContext(searchProfile);
  const genderFilteredRows = filterRowsByRequestedGender(rows, searchProfile.gender);

  let candidateRows = genderFilteredRows;

  if (ontology.exactRequestedNotes.length && ontology.exactNoteTerms.length) {
    const exactRows = genderFilteredRows.filter((row) => {
      const haystack = buildHaystack(row);
      return ontology.exactNoteTerms.some((term) => containsTerm(haystack, term));
    });

    // If exact note exists in DB, do NOT dilute results with broad style/fruity matches.
    if (exactRows.length) candidateRows = exactRows;
  }

  const scored = candidateRows
    .map((row) => {
      const baseScore = scoreCandidate(row, searchProfile);
      const expanded = applyOntologyScore(row, ontology);
      const total = baseScore + expanded.score;

      return {
        ...row,
        match_score: total,
        _debug: {
          ...buildMatchDebug(row, ontology, expanded),
          normalized_item_gender: normalizeGenderValue(row.gender),
          normalized_requested_gender: normalizeGenderValue(searchProfile.gender),
          baseScore,
          ontologyScore: expanded.score,
          totalScore: total,
        },
      };
    })
    .filter((row) => Number(row.match_score || 0) > 0)
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      // If scores are close/equal, unisex first when it is part of the allowed list.
      const ag = normalizeGenderValue(a.gender) === "unisex" ? 0 : 1;
      const bg = normalizeGenderValue(b.gender) === "unisex" ? 0 : 1;
      if (ag !== bg) return ag - bg;

      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, hardLimit);

  return scored;
}

module.exports = {
  findCandidates,
  normalizeGenderValue,
};
