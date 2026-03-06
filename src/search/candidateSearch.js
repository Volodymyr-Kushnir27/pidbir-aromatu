const { getAllPerfumes } = require("./catalogRepo");
const { scoreCandidate } = require("../utils/scoring");
const { norm, uniq } = require("../utils/text");

/* =========================
   Notes / accords synonyms
========================= */

const NOTE_SYNONYMS = {
  // watermelon
  "кавун": ["кавун", "арбуз", "watermelon", "melon", "water melon"],
  "арбуз": ["кавун", "арбуз", "watermelon", "melon", "water melon"],
  "watermelon": ["кавун", "арбуз", "watermelon", "melon", "water melon"],

  // cherry
  "вишня": ["вишня", "вишня", "вишнёвый", "cherry", "sweet cherry", "black cherry"],
  "вишнёвый": ["вишня", "вишнёвый", "cherry", "sweet cherry", "black cherry"],
  "черешня": ["черешня", "вишня", "черешня", "cherry", "sweet cherry"],
  "cherry": ["вишня", "вишнёвый", "черешня", "cherry", "sweet cherry", "black cherry"],

  // strawberry
  "полуниця": ["полуниця", "клубника", "strawberry"],
  "клубника": ["полуниця", "клубника", "strawberry"],
  "strawberry": ["полуниця", "клубника", "strawberry"],

  // raspberry
  "малина": ["малина", "raspberry"],
  "raspberry": ["малина", "raspberry"],

  // peach
  "персик": ["персик", "peach"],
  "peach": ["персик", "peach"],

  // apple
  "яблуко": ["яблуко", "яблоко", "apple", "green apple", "red apple"],
  "яблоко": ["яблуко", "яблоко", "apple", "green apple", "red apple"],
  "apple": ["яблуко", "яблоко", "apple", "green apple", "red apple"],

  // pear
  "груша": ["груша", "pear"],
  "pear": ["груша", "pear"],

  // lemon
  "лимон": ["лимон", "lemon"],
  "lemon": ["лимон", "lemon"],

  // bergamot
  "бергамот": ["бергамот", "bergamot"],
  "bergamot": ["бергамот", "bergamot"],

  // orange / mandarin
  "апельсин": ["апельсин", "orange", "mandarin", "tangerine"],
  "orange": ["апельсин", "orange", "mandarin", "tangerine"],

  // vanilla
  "ваніль": ["ваніль", "ваниль", "vanilla"],
  "ваниль": ["ваніль", "ваниль", "vanilla"],
  "vanilla": ["ваніль", "ваниль", "vanilla"],

  // musk
  "мускус": ["мускус", "musk", "white musk"],
  "musk": ["мускус", "musk", "white musk"],

  // cedar
  "кедр": ["кедр", "cedar", "cedarwood"],
  "cedar": ["кедр", "cedar", "cedarwood"],

  // sandalwood
  "сандал": ["сандал", "sandal", "sandalwood"],
  "sandal": ["сандал", "sandal", "sandalwood"],
  "sandalwood": ["сандал", "sandal", "sandalwood"],

  // rose
  "троянда": ["троянда", "роза", "rose"],
  "роза": ["троянда", "роза", "rose"],
  "rose": ["троянда", "роза", "rose"],

  // jasmine
  "жасмин": ["жасмин", "jasmine"],
  "jasmine": ["жасмин", "jasmine"],

  // lavender
  "лаванда": ["лаванда", "lavender"],
  "lavender": ["лаванда", "lavender"],

  // marine / aquatic
  "морський": ["морський", "морской", "marine", "aquatic", "oceanic", "sea", "ozonic"],
  "морской": ["морський", "морской", "marine", "aquatic", "oceanic", "sea", "ozonic"],
  "aquatic": ["морський", "морской", "marine", "aquatic", "oceanic", "sea", "ozonic"],
  "marine": ["морський", "морской", "marine", "aquatic", "oceanic", "sea", "ozonic"],

  // ozonic
  "озоновий": ["озоновий", "озоновый", "ozonic", "fresh air"],
  "озоновый": ["озоновий", "озоновый", "ozonic", "fresh air"],
  "ozonic": ["озоновий", "озоновый", "ozonic", "fresh air"],

  // leather
  "шкіра": ["шкіра", "кожа", "leather"],
  "кожа": ["шкіра", "кожа", "leather"],
  "leather": ["шкіра", "кожа", "leather"],

  // tobacco
  "тютюн": ["тютюн", "табак", "tobacco"],
  "табак": ["тютюн", "табак", "tobacco"],
  "tobacco": ["тютюн", "табак", "tobacco"],

  // coffee
  "кава": ["кава", "кофе", "coffee", "espresso"],
  "кофе": ["кава", "кофе", "coffee", "espresso"],
  "coffee": ["кава", "кофе", "coffee", "espresso"],

  // rum / boozy
  "ром": ["ром", "rum", "boozy", "liquor"],
  "rum": ["ром", "rum", "boozy", "liquor"],

  // coconut
  "кокос": ["кокос", "coconut"],
  "coconut": ["кокос", "coconut"],

  // pineapple
  "ананас": ["ананас", "pineapple"],
  "pineapple": ["ананас", "pineapple"],

  // currant / cassis
  "смородина": ["смородина", "black currant", "currant", "cassis"],
  "cassis": ["смородина", "black currant", "currant", "cassis"],
};

/* =========================
   Style synonyms
========================= */

const STYLE_SYNONYMS = {
  "свіжий": ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],
  "свежий": ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],
  "fresh": ["свіжий", "свежий", "fresh", "clean", "crisp", "airy"],

  "солодкий": ["солодкий", "сладкий", "sweet", "gourmand", "candied"],
  "сладкий": ["солодкий", "сладкий", "sweet", "gourmand", "candied"],
  "sweet": ["солодкий", "сладкий", "sweet", "gourmand", "candied"],

  "шлейфовий": ["шлейфовий", "шлейфовый", "trail", "projection", "long lasting", "sillage", "noticeable"],
  "шлейфовый": ["шлейфовий", "шлейфовый", "trail", "projection", "long lasting", "sillage", "noticeable"],

  "легкий": ["легкий", "лёгкий", "light", "airy", "soft"],
  "лёгкий": ["легкий", "лёгкий", "light", "airy", "soft"],

  "ніжний": ["ніжний", "нежный", "soft", "gentle", "delicate"],
  "нежный": ["ніжний", "нежный", "soft", "gentle", "delicate"],

  "яскравий": ["яскравий", "яркий", "bright", "vivid", "radiant"],
  "яркий": ["яскравий", "яркий", "bright", "vivid", "radiant"],

  "фруктовий": ["фруктовий", "фруктовый", "fruity", "juicy"],
  "фруктовый": ["фруктовий", "фруктовый", "fruity", "juicy"],

  "квітковий": ["квітковий", "цветочный", "floral"],
  "цветочный": ["квітковий", "цветочный", "floral"],

  "деревний": ["деревний", "древесный", "woody", "wood"],
  "древесный": ["деревний", "древесный", "woody", "wood"],

  "пряний": ["пряний", "пряный", "spicy", "warm spicy"],
  "пряный": ["пряний", "пряный", "spicy", "warm spicy"],

  "пудровий": ["пудровий", "пудровый", "powdery"],
  "пудровый": ["пудровий", "пудровый", "powdery"],

  "зелений": ["зелений", "зеленый", "green", "herbal"],
  "зеленый": ["зелений", "зеленый", "green", "herbal"],

  "літній": ["літній", "летний", "summer", "sunny"],
  "летний": ["літній", "летний", "summer", "sunny"],

  "зимовий": ["зимовий", "зимний", "winter", "warm"],
  "зимний": ["зимовий", "зимний", "winter", "warm"],

  "вечірній": ["вечірній", "вечерний", "evening", "night", "date night"],
  "вечерний": ["вечірній", "вечерний", "evening", "night", "date night"],

  "денний": ["денний", "дневной", "daytime", "office", "daily"],
  "дневной": ["денний", "дневной", "daytime", "office", "daily"],
};

/* =========================
   Gender / season synonyms
========================= */

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
  unisex: [
    "unisex",
    "унісекс",
    "унисекс",
    "для всіх",
    "для всех",
  ],
};

const SEASON_SYNONYMS = {
  spring: ["spring", "весна", "весняний", "весенний"],
  summer: ["summer", "літо", "літній", "лето", "летний"],
  autumn: ["autumn", "fall", "осінь", "осінній", "осень", "осенний"],
  winter: ["winter", "зима", "зимовий", "зимний"],
};

/* =========================
   Helpers
========================= */

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

function applyOntologyScore(row, profile) {
  const haystack = buildHaystack(row);
  let score = 0;

  const noteTerms = expandTerms(
    [
      ...(profile.notes_include || []),
      ...(profile.notes_prefer || []),
      ...(profile.notes_include_synonyms || []),
      ...(profile.notes_prefer_synonyms || []),
      ...(profile.raw_terms || []),
    ],
    NOTE_SYNONYMS,
  );

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

  const genderTerms = expandGender(profile.gender);
  const seasonTerms = expandSeason(profile.season || []);
  const excludeTerms = expandTerms(profile.exclude_tags || [], {
    ...NOTE_SYNONYMS,
    ...STYLE_SYNONYMS,
  });

  const noteMatches = countMatches(haystack, noteTerms);
  const accordMatches = countMatches(haystack, accordTerms);
  const genderMatches = countMatches(haystack, genderTerms);
  const seasonMatches = countMatches(haystack, seasonTerms);
  const excludeMatches = countMatches(haystack, excludeTerms);

  score += noteMatches * 10;
  score += accordMatches * 6;
  score += genderMatches * 7;
  score += seasonMatches * 4;
  score -= excludeMatches * 8;

  return {
    score,
    noteTerms,
    accordTerms,
    genderTerms,
    seasonTerms,
    excludeTerms,
  };
}

function buildMatchDebug(row, expanded) {
  const haystack = buildHaystack(row);

  return {
    matched_notes: expanded.noteTerms.filter((t) => haystack.includes(norm(t))).slice(0, 8),
    matched_accords: expanded.accordTerms.filter((t) => haystack.includes(norm(t))).slice(0, 8),
    matched_gender: expanded.genderTerms.filter((t) => haystack.includes(norm(t))).slice(0, 4),
    matched_seasons: expanded.seasonTerms.filter((t) => haystack.includes(norm(t))).slice(0, 4),
  };
}

/* =========================
   Main search
========================= */

function findCandidates(searchProfile, limit = 50) {
  const rows = getAllPerfumes();

  const scored = rows
    .map((row) => {
      const baseScore = scoreCandidate(row, searchProfile);
      const expanded = applyOntologyScore(row, searchProfile);
      const total = baseScore + expanded.score;

      return {
        ...row,
        match_score: total,
        _debug: buildMatchDebug(row, expanded),
      };
    })
    .filter((row) => row.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  return scored;
}

module.exports = { findCandidates };