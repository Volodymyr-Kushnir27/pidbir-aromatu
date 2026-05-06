const { getAllPerfumes } = require("./catalogRepo");
const { scoreCandidate } = require("../utils/scoring");
const { norm, uniq } = require("../utils/text");

/**
 * FINAL candidate search:
 * - cap results to 30;
 * - exact requested notes are primary;
 * - if exact note exists in DB, fallback style-only items are removed;
 * - unisex is allowed for male/female requests and gets priority when note similarity is real.
 */

const EXACT_NOTE_GROUPS = {
  кавун: {
    canonical: "кавун",
    exact: ["кавун", "арбуз", "watermelon", "water melon"],
    fallback: ["melon", "диня", "фруктовий", "fruity", "juicy", "літній", "summer"],
  },
  арбуз: {
    canonical: "кавун",
    exact: ["кавун", "арбуз", "watermelon", "water melon"],
    fallback: ["melon", "диня", "фруктовий", "fruity", "juicy", "літній", "summer"],
  },
  watermelon: {
    canonical: "кавун",
    exact: ["кавун", "арбуз", "watermelon", "water melon"],
    fallback: ["melon", "диня", "фруктовий", "fruity", "juicy", "літній", "summer"],
  },

  лимон: {
    canonical: "лимон",
    exact: ["лимон", "lemon", "citron", "цитрон", "лимонна цедра", "lemon zest"],
    fallback: ["citrus", "цитрус", "цитруси", "bergamot", "бергамот", "fresh", "свіжий"],
  },
  lemon: {
    canonical: "лимон",
    exact: ["лимон", "lemon", "citron", "цитрон", "лимонна цедра", "lemon zest"],
    fallback: ["citrus", "цитрус", "цитруси", "bergamot", "бергамот", "fresh", "свіжий"],
  },

  ваніль: {
    canonical: "ваніль",
    exact: ["ваніль", "ваниль", "vanilla"],
    fallback: ["sweet", "солодкий", "gourmand", "гурманський", "cream", "крем"],
  },
  vanilla: {
    canonical: "ваніль",
    exact: ["ваніль", "ваниль", "vanilla"],
    fallback: ["sweet", "солодкий", "gourmand", "гурманський", "cream", "крем"],
  },

  кава: {
    canonical: "кава",
    exact: ["кава", "кофе", "coffee", "espresso"],
    fallback: ["gourmand", "гурманський", "warm", "теплий"],
  },
  coffee: {
    canonical: "кава",
    exact: ["кава", "кофе", "coffee", "espresso"],
    fallback: ["gourmand", "гурманський", "warm", "теплий"],
  },

  вишня: {
    canonical: "вишня",
    exact: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],
    fallback: ["fruity", "фруктовий", "sweet", "солодкий"],
  },
  cherry: {
    canonical: "вишня",
    exact: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],
    fallback: ["fruity", "фруктовий", "sweet", "солодкий"],
  },

  полуниця: {
    canonical: "полуниця",
    exact: ["полуниця", "клубника", "strawberry"],
    fallback: ["fruity", "фруктовий", "sweet", "солодкий"],
  },
  strawberry: {
    canonical: "полуниця",
    exact: ["полуниця", "клубника", "strawberry"],
    fallback: ["fruity", "фруктовий", "sweet", "солодкий"],
  },

  кокос: {
    canonical: "кокос",
    exact: ["кокос", "coconut"],
    fallback: ["tropical", "тропічний", "creamy", "кремовий", "sweet", "солодкий"],
  },
  coconut: {
    canonical: "кокос",
    exact: ["кокос", "coconut"],
    fallback: ["tropical", "тропічний", "creamy", "кремовий", "sweet", "солодкий"],
  },

  ананас: {
    canonical: "ананас",
    exact: ["ананас", "pineapple"],
    fallback: ["tropical", "тропічний", "fruity", "фруктовий", "juicy"],
  },
  pineapple: {
    canonical: "ананас",
    exact: ["ананас", "pineapple"],
    fallback: ["tropical", "тропічний", "fruity", "фруктовий", "juicy"],
  },
};

const NOTE_SYNONYMS = {
  кавун: ["кавун", "арбуз", "watermelon", "water melon"],
  арбуз: ["кавун", "арбуз", "watermelon", "water melon"],
  watermelon: ["кавун", "арбуз", "watermelon", "water melon"],

  диня: ["диня", "melon"],
  melon: ["диня", "melon"],

  вишня: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],
  cherry: ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],

  полуниця: ["полуниця", "клубника", "strawberry"],
  strawberry: ["полуниця", "клубника", "strawberry"],

  малина: ["малина", "raspberry"],
  raspberry: ["малина", "raspberry"],

  персик: ["персик", "peach"],
  peach: ["персик", "peach"],

  яблуко: ["яблуко", "яблоко", "apple", "green apple", "red apple"],
  apple: ["яблуко", "яблоко", "apple", "green apple", "red apple"],

  груша: ["груша", "pear"],
  pear: ["груша", "pear"],

  лимон: ["лимон", "lemon", "citron", "цитрон", "lemon zest", "лимонна цедра"],
  lemon: ["лимон", "lemon", "citron", "цитрон", "lemon zest", "лимонна цедра"],

  бергамот: ["бергамот", "bergamot"],
  bergamot: ["бергамот", "bergamot"],

  апельсин: ["апельсин", "orange", "mandarin", "tangerine"],
  orange: ["апельсин", "orange", "mandarin", "tangerine"],

  ваніль: ["ваніль", "ваниль", "vanilla"],
  vanilla: ["ваніль", "ваниль", "vanilla"],

  мускус: ["мускус", "musk", "white musk"],
  musk: ["мускус", "musk", "white musk"],

  кедр: ["кедр", "cedar", "cedarwood"],
  cedar: ["кедр", "cedar", "cedarwood"],

  сандал: ["сандал", "sandal", "sandalwood"],
  sandalwood: ["сандал", "sandal", "sandalwood"],

  троянда: ["троянда", "роза", "rose"],
  rose: ["троянда", "роза", "rose"],

  жасмин: ["жасмин", "jasmine"],
  jasmine: ["жасмин", "jasmine"],

  лаванда: ["лаванда", "lavender"],
  lavender: ["лаванда", "lavender"],

  кава: ["кава", "кофе", "coffee", "espresso"],
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
  fresh: ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],

  солодкий: ["солодкий", "сладкий", "sweet", "gourmand", "candied"],
  sweet: ["солодкий", "сладкий", "sweet", "gourmand", "candied"],

  шлейфовий: ["шлейфовий", "шлейфовый", "trail", "projection", "long lasting", "sillage", "noticeable"],

  легкий: ["легкий", "лёгкий", "light", "airy", "soft"],
  ніжний: ["ніжний", "нежный", "soft", "gentle", "delicate"],
  яскравий: ["яскравий", "яркий", "bright", "vivid", "radiant"],

  фруктовий: ["фруктовий", "фруктовый", "fruity", "juicy"],
  fruity: ["фруктовий", "фруктовый", "fruity", "juicy"],

  квітковий: ["квітковий", "цветочный", "floral"],
  floral: ["квітковий", "цветочный", "floral"],

  деревний: ["деревний", "древесный", "woody", "wood"],
  woody: ["деревний", "древесный", "woody", "wood"],

  пряний: ["пряний", "пряный", "spicy", "warm spicy"],
  spicy: ["пряний", "пряный", "spicy", "warm spicy"],

  пудровий: ["пудровий", "пудровый", "powdery"],
  зелений: ["зелений", "зеленый", "green", "herbal"],

  літній: ["літній", "летний", "summer", "sunny"],
  summer: ["літній", "летний", "summer", "sunny"],

  зимовий: ["зимовий", "зимний", "winter", "warm"],
  вечірній: ["вечірній", "вечерный", "evening", "night", "date night"],
  денний: ["денний", "дневной", "daytime", "office", "daily"],

  гурманський: ["гурманський", "гурманский", "gourmand", "dessert", "sweet"],
  gourmand: ["гурманський", "гурманский", "gourmand", "dessert", "sweet"],
};

const GENDER_SYNONYMS = {
  male: ["male", "man", "men", "чоловічий", "мужской", "для чоловіка", "для чоловіків", "для мужчины", "для мужчин"],
  female: ["female", "woman", "women", "жіночий", "женский", "для жінки", "для жінок", "для женщины", "для женщин"],
  unisex: ["unisex", "унісекс", "унисекс", "для всіх", "для всех"],
};

const SEASON_SYNONYMS = {
  spring: ["spring", "весна", "весняний", "весенний"],
  summer: ["summer", "літо", "літній", "лето", "летний"],
  autumn: ["autumn", "fall", "осінь", "осінній", "осень", "осенний"],
  winter: ["winter", "зима", "зимовий", "зимний"],
};

function hasWord(text, word) {
  const escaped = String(word || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(String(text || ""));
}

function normalizeText(value) {
  return norm(String(value || ""))
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHaystack(row) {
  return normalizeText(
    [
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
    ]
      .filter(Boolean)
      .join(" | "),
  );
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

function countMatches(haystack, terms = []) {
  let count = 0;
  for (const term of terms || []) {
    const t = normalizeText(term);
    if (!t) continue;
    if (hasWord(haystack, t) || haystack.includes(t)) count += 1;
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
  const rawNoteTerms = [
    ...(profile.notes_include || []),
    ...(profile.notes_prefer || []),
    ...(profile.notes_include_synonyms || []),
    ...(profile.notes_prefer_synonyms || []),
    ...(profile.raw_terms || []),
  ];

  const noteTerms = expandTerms(rawNoteTerms, NOTE_SYNONYMS);
  const accordTerms = expandTerms(
    [
      ...(profile.accords || []),
      ...(profile.style_tags || []),
      ...(profile.accord_synonyms || []),
      ...(profile.style_synonyms || []),
      ...(profile.raw_terms || []),
    ],
    STYLE_SYNONYMS,
  );

  const requestedExactNoteGroups = detectRequestedExactNoteGroups(rawNoteTerms);

  return {
    noteTerms,
    accordTerms,
    genderTerms: expandGender(profile.gender),
    seasonTerms: expandSeason(profile.season || []),
    excludeTerms: expandTerms(profile.exclude_tags || [], { ...NOTE_SYNONYMS, ...STYLE_SYNONYMS }),
    requestedExactNoteGroups,
  };
}

function detectRequestedExactNoteGroups(terms = []) {
  const out = [];

  for (const term of terms || []) {
    const t = normalizeText(term);
    if (!t) continue;

    for (const [key, group] of Object.entries(EXACT_NOTE_GROUPS)) {
      const keyNorm = normalizeText(key);
      const exactTerms = group.exact.map(normalizeText);

      if (t === keyNorm || exactTerms.includes(t) || exactTerms.some((x) => hasWord(t, x))) {
        out.push(group);
      }
    }
  }

  const byCanonical = new Map();
  for (const group of out) byCanonical.set(group.canonical, group);
  return [...byCanonical.values()];
}

function rowMatchesExactNoteGroup(row, group) {
  const haystack = buildHaystack(row);
  return group.exact.some((term) => {
    const t = normalizeText(term);
    return hasWord(haystack, t) || haystack.includes(t);
  });
}

function exactNoteMatchCount(row, groups = []) {
  let count = 0;
  for (const group of groups || []) {
    if (rowMatchesExactNoteGroup(row, group)) count += 1;
  }
  return count;
}

function applyOntologyScore(row, ontology) {
  const haystack = buildHaystack(row);

  const noteMatches = countMatches(haystack, ontology.noteTerms);
  const accordMatches = countMatches(haystack, ontology.accordTerms);
  const genderMatches = countMatches(haystack, ontology.genderTerms);
  const seasonMatches = countMatches(haystack, ontology.seasonTerms);
  const excludeMatches = countMatches(haystack, ontology.excludeTerms);
  const exactNotes = exactNoteMatchCount(row, ontology.requestedExactNoteGroups);

  let score = 0;
  score += exactNotes * 120;
  score += noteMatches * 14;
  score += accordMatches * 6;
  score += genderMatches * 7;
  score += seasonMatches * 4;
  score -= excludeMatches * 8;

  const itemGender = normalizeGenderValue(row.gender);
  if (itemGender === "unisex" && (exactNotes > 0 || noteMatches > 0 || accordMatches > 0)) {
    score += 24;
  }

  return {
    score,
    noteMatches,
    accordMatches,
    exactNotes,
  };
}

function buildMatchDebug(row, ontology) {
  const haystack = buildHaystack(row);

  return {
    exact_note_groups: ontology.requestedExactNoteGroups.map((x) => x.canonical),
    matched_exact_notes: ontology.requestedExactNoteGroups
      .filter((group) => rowMatchesExactNoteGroup(row, group))
      .map((x) => x.canonical),
    matched_notes: ontology.noteTerms.filter((t) => haystack.includes(norm(t))).slice(0, 8),
    matched_accords: ontology.accordTerms.filter((t) => haystack.includes(norm(t))).slice(0, 8),
    matched_gender: ontology.genderTerms.filter((t) => haystack.includes(norm(t))).slice(0, 4),
    matched_seasons: ontology.seasonTerms.filter((t) => haystack.includes(norm(t))).slice(0, 4),
  };
}

function filterRowsByRequestedGender(rows, requestedGender) {
  const req = normalizeGenderValue(requestedGender);

  if (req === "female") {
    return rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "female" || g === "unisex";
    });
  }

  if (req === "male") {
    return rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "male" || g === "unisex";
    });
  }

  if (req === "unisex") {
    return rows.filter((row) => normalizeGenderValue(row.gender) === "unisex");
  }

  return rows;
}

function findCandidates(searchProfile = {}, limit = 30) {
  const cap = Math.min(Number(limit || 30), 30);
  const rows = getAllPerfumes();
  const ontology = buildOntologyContext(searchProfile);

  let filteredRows = filterRowsByRequestedGender(rows, searchProfile.gender);

  // If user requested exact note and DB contains exact matches,
  // do not let general style/accord items outrank exact note items.
  if (ontology.requestedExactNoteGroups.length) {
    const exactRows = filteredRows.filter((row) => exactNoteMatchCount(row, ontology.requestedExactNoteGroups) > 0);
    if (exactRows.length) filteredRows = exactRows;
  }

  const scored = filteredRows
    .map((row) => {
      const baseScore = scoreCandidate(row, searchProfile);
      const expanded = applyOntologyScore(row, ontology);
      const total = baseScore + expanded.score;

      return {
        ...row,
        match_score: total,
        _debug: {
          ...buildMatchDebug(row, ontology),
          normalized_item_gender: normalizeGenderValue(row.gender),
          normalized_requested_gender: normalizeGenderValue(searchProfile.gender),
          baseScore,
          ontologyScore: expanded.score,
          totalScore: total,
          unisexPriority: normalizeGenderValue(row.gender) === "unisex",
        },
      };
    })
    .filter((row) => Number(row.match_score || 0) > 0)
    .sort((a, b) => {
      const aScore = Number(a.match_score || 0);
      const bScore = Number(b.match_score || 0);
      if (aScore !== bScore) return bScore - aScore;

      const ag = normalizeGenderValue(a.gender);
      const bg = normalizeGenderValue(b.gender);
      if (ag === "unisex" && bg !== "unisex") return -1;
      if (bg === "unisex" && ag !== "unisex") return 1;

      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, cap);

  return scored;
}

module.exports = {
  findCandidates,
  normalizeGenderValue,
  buildOntologyContext,
  detectRequestedExactNoteGroups,
};
