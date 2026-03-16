const { getAllPerfumes } = require("./catalogRepo");
const { scoreCandidate } = require("../utils/scoring");
const { norm, uniq } = require("../utils/text");

/* =========================
   Notes / accords synonyms
========================= */

const NOTE_SYNONYMS = {
  кавун: ["кавун", "арбуз", "watermelon", "melon", "water melon"],
  арбуз: ["кавун", "арбуз", "watermelon", "melon", "water melon"],
  watermelon: ["кавун", "арбуз", "watermelon", "melon", "water melon"],

  вишня: ["вишня", "вишнёвый", "cherry", "sweet cherry", "black cherry"],
  вишнёвый: ["вишня", "вишнёвый", "cherry", "sweet cherry", "black cherry"],
  черешня: ["черешня", "вишня", "cherry", "sweet cherry"],
  cherry: [
    "вишня",
    "вишнёвый",
    "черешня",
    "cherry",
    "sweet cherry",
    "black cherry",
  ],

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

  лимон: ["лимон", "lemon"],
  lemon: ["лимон", "lemon"],

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

  морський: [
    "морський",
    "морской",
    "marine",
    "aquatic",
    "oceanic",
    "sea",
    "ozonic",
  ],
  морской: [
    "морський",
    "морской",
    "marine",
    "aquatic",
    "oceanic",
    "sea",
    "ozonic",
  ],
  aquatic: [
    "морський",
    "морской",
    "marine",
    "aquatic",
    "oceanic",
    "sea",
    "ozonic",
  ],
  marine: [
    "морський",
    "морской",
    "marine",
    "aquatic",
    "oceanic",
    "sea",
    "ozonic",
  ],

  озоновий: ["озоновий", "озоновый", "ozonic", "fresh air"],
  озоновый: ["озоновий", "озоновый", "ozonic", "fresh air"],
  ozonic: ["озоновий", "озоновый", "ozonic", "fresh air"],

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

  шлейфовий: [
    "шлейфовий",
    "шлейфовый",
    "trail",
    "projection",
    "long lasting",
    "sillage",
    "noticeable",
  ],
  шлейфовый: [
    "шлейфовий",
    "шлейфовый",
    "trail",
    "projection",
    "long lasting",
    "sillage",
    "noticeable",
  ],

  легкий: ["легкий", "лёгкий", "light", "airy", "soft"],
  лёгкий: ["легкий", "лёгкий", "light", "airy", "soft"],

  ніжний: ["ніжний", "нежный", "soft", "gentle", "delicate"],
  нежный: ["ніжний", "нежный", "soft", "gentle", "delicate"],

  яскравий: ["яскравий", "яркий", "bright", "vivid", "radiant"],
  яркий: ["яскравий", "яркий", "bright", "vivid", "radiant"],

  фруктовий: ["фруктовий", "фруктовый", "fruity", "juicy"],
  фруктовый: ["фруктовий", "фруктовый", "fruity", "juicy"],

  квітковий: ["квітковий", "цветочный", "floral"],
  цветочный: ["квітковий", "цветочный", "floral"],

  деревний: ["деревний", "древесный", "woody", "wood"],
  древесный: ["деревний", "древесный", "woody", "wood"],

  пряний: ["пряний", "пряный", "spicy", "warm spicy"],
  пряный: ["пряний", "пряный", "spicy", "warm spicy"],

  пудровий: ["пудровий", "пудровый", "powdery"],
  пудровый: ["пудровий", "пудровый", "powdery"],

  зелений: ["зелений", "зеленый", "green", "herbal"],
  зеленый: ["зелений", "зеленый", "green", "herbal"],

  літній: ["літній", "летний", "summer", "sunny"],
  летний: ["літній", "летний", "summer", "sunny"],

  зимовий: ["зимовий", "зимний", "winter", "warm"],
  зимний: ["зимовий", "зимний", "winter", "warm"],

  вечірній: ["вечірній", "вечерный", "evening", "night", "date night"],
  вечерний: ["вечірній", "вечерный", "evening", "night", "date night"],

  денний: ["денний", "дневной", "daytime", "office", "daily"],
  дневной: ["денний", "дневной", "daytime", "office", "daily"],
};

const GENDER_SYNONYMS = {
  male: [
    "male",
    "man",
    "men",
    "чоловічий",
    "мужской",
    "для чоловіка",
    "для чоловіків",
    "для мужчины",
    "для мужчин",
  ],
  female: [
    "female",
    "woman",
    "women",
    "жіночий",
    "женский",
    "для жінки",
    "для жінок",
    "для женщины",
    "для женщин",
  ],
  unisex: ["unisex", "унісекс", "унисекс", "для всіх", "для всех"],
};

const SEASON_SYNONYMS = {
  spring: ["spring", "весна", "весняний", "весенний"],
  summer: ["summer", "літо", "літній", "лето", "летний"],
  autumn: ["autumn", "fall", "осінь", "осінній", "осень", "осенний"],
  winter: ["winter", "зима", "зимовий", "зимний"],
};

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
      if (key.includes(dictKey) || dictKey.includes(key)) {
        out.push(...arr);
      }
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
  return [
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
    .join(" | ")
    .toLowerCase();
}

function countMatches(haystack, terms = []) {
  let count = 0;

  for (const term of terms || []) {
    const t = norm(term);
    if (!t) continue;
    if (haystack.includes(t)) count += 1;
  }

  return count;
}

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  const hasUnisex =
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    g.includes("unisex");

  const hasFemale =
    g.includes("жіноч") ||
    g.includes("женск") ||
    g.includes("female") ||
    g.includes("women") ||
    g.includes("woman");

  const hasMale =
    g.includes("чолов") ||
    g.includes("мужск") ||
    g.includes("male") ||
    g.includes("men") ||
    g.includes("man");

  if (hasUnisex) return "unisex";
  if (hasFemale && hasMale) return "unisex";
  if (hasFemale) return "female";
  if (hasMale) return "male";

  return "unknown";
}

function buildOntologyContext(profile = {}) {
  const noteTerms = expandTerms(
    [
      ...(profile.notes_include || []),
      ...(profile.notes_prefer || []),
      ...(profile.notes_include_synonyms || []),
      ...(profile.notes_prefer_synonyms || []),
      ...(profile.raw_terms || []),
    ],
    NOTE_SYNONYMS
  );

  const accordTerms = expandTerms(
    [
      ...(profile.accords || []),
      ...(profile.style_tags || []),
      ...(profile.accord_synonyms || []),
      ...(profile.style_synonyms || []),
      ...(profile.raw_terms || []),
    ],
    STYLE_SYNONYMS
  );

  const genderTerms = expandGender(profile.gender);
  const seasonTerms = expandSeason(profile.season || []);
  const excludeTerms = expandTerms(profile.exclude_tags || [], {
    ...NOTE_SYNONYMS,
    ...STYLE_SYNONYMS,
  });

  return {
    noteTerms,
    accordTerms,
    genderTerms,
    seasonTerms,
    excludeTerms,
  };
}

function applyOntologyScore(row, ontology) {
  const haystack = buildHaystack(row);
  let score = 0;

  const noteMatches = countMatches(haystack, ontology.noteTerms);
  const accordMatches = countMatches(haystack, ontology.accordTerms);
  const genderMatches = countMatches(haystack, ontology.genderTerms);
  const seasonMatches = countMatches(haystack, ontology.seasonTerms);
  const excludeMatches = countMatches(haystack, ontology.excludeTerms);

  score += noteMatches * 10;
  score += accordMatches * 6;
  score += genderMatches * 7;
  score += seasonMatches * 4;
  score -= excludeMatches * 8;

  return {
    score,
    ...ontology,
  };
}

function buildMatchDebug(row, expanded) {
  const haystack = buildHaystack(row);

  return {
    matched_notes: expanded.noteTerms
      .filter((t) => haystack.includes(norm(t)))
      .slice(0, 8),
    matched_accords: expanded.accordTerms
      .filter((t) => haystack.includes(norm(t)))
      .slice(0, 8),
    matched_gender: expanded.genderTerms
      .filter((t) => haystack.includes(norm(t)))
      .slice(0, 4),
    matched_seasons: expanded.seasonTerms
      .filter((t) => haystack.includes(norm(t)))
      .slice(0, 4),
  };
}

function findCandidates(searchProfile = {}, limit = 50) {
  const rows = getAllPerfumes();
  const ontology = buildOntologyContext(searchProfile);
  const reqGender = normalizeGenderValue(searchProfile.gender);

  let filteredRows = rows;

  if (reqGender === "female") {
    filteredRows = rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "female";
    });
  } else if (reqGender === "male") {
    filteredRows = rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "male";
    });
  } else if (reqGender === "unisex") {
    filteredRows = rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "unisex";
    });
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
          ...buildMatchDebug(row, expanded),
          baseScore,
          ontologyScore: expanded.score,
          totalScore: total,
        },
      };
    })
    .sort((a, b) => {
      const aScore = Number(a.match_score || 0);
      const bScore = Number(b.match_score || 0);
      return bScore - aScore;
    })
    .slice(0, limit);

  return scored;
}

module.exports = { findCandidates };