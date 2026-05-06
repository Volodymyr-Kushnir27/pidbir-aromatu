const {
  cleanDirectQuery,
  applyCommonAliases,
  detectGenderFromQuery,
} = require("./directNameKeywordSearch");

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[ʼ’‘`´]/g, "'")
    .replace(/[“”"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NOTE_REQUEST_WORDS = new Set([
  "нота", "нотою", "ноти", "нотами", "note", "notes",
  "аромат", "аромату", "парфум", "парфуми", "духи",
  "підбери", "подбери", "знайди", "найди", "покажи", "хочу", "треба", "мені", "мне",
  "з", "із", "с", "with",
]);

const EXACT_NOTE_GROUPS = {
  watermelon: {
    exact: ["кавун", "кавуна", "кавуном", "кавуновий", "арбуз", "арбуза", "арбузом", "арбузный", "watermelon", "water melon"],
    fallback: ["диня", "дыня", "melon", "fruity", "фруктовий", "фруктовый", "літній", "летний", "fresh", "свіжий", "свежий"],
  },
  lemon: {
    exact: ["лимон", "лимона", "лимоном", "лимонний", "lemon", "citron"],
    fallback: ["цитрус", "цитруси", "citrus", "bergamot", "бергамот", "fresh", "свіжий"],
  },
  vanilla: {
    exact: ["ваніль", "ванілі", "ваниль", "ванили", "ванільний", "ванильный", "vanilla"],
    fallback: ["sweet", "солодкий", "сладкий", "gourmand", "гурманський", "cream", "крем"],
  },
  cherry: {
    exact: ["вишня", "вишні", "вишневий", "черешня", "cherry", "sweet cherry", "black cherry"],
    fallback: ["berry", "ягідний", "ягодный", "fruity", "фруктовий"],
  },
  peach: {
    exact: ["персик", "персика", "персиком", "персиковий", "peach"],
    fallback: ["fruity", "фруктовий", "солодкий", "sweet", "juicy"],
  },
  coffee: {
    exact: ["кава", "кави", "кавою", "кавовий", "кофе", "coffee", "espresso"],
    fallback: ["gourmand", "гурманський", "sweet", "солодкий", "warm", "теплий"],
  },
  tobacco: {
    exact: ["тютюн", "тютюну", "табак", "tobacco"],
    fallback: ["smoky", "димний", "warm", "теплий", "spicy", "пряний"],
  },
  leather: {
    exact: ["шкіра", "шкіри", "кожа", "leather"],
    fallback: ["smoky", "димний", "dark", "темний", "woody", "деревний"],
  },
  coconut: {
    exact: ["кокос", "кокоса", "coconut"],
    fallback: ["tropical", "тропічний", "sweet", "солодкий", "creamy", "кремовий"],
  },
  pineapple: {
    exact: ["ананас", "ананаса", "pineapple"],
    fallback: ["tropical", "тропічний", "fruity", "фруктовий", "juicy"],
  },
};

function tokensOf(value) {
  return norm(value)
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizePhrase(value) {
  return ` ${norm(value)
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function containsPhrase(haystack, phrase) {
  const h = normalizePhrase(haystack);
  const p = normalizePhrase(phrase).trim();
  return Boolean(p && h.includes(` ${p} `));
}

function getExplicitRequestedNotes(text) {
  const t = norm(text);
  const found = [];

  for (const [canonical, group] of Object.entries(EXACT_NOTE_GROUPS)) {
    const matched = group.exact.some((term) => containsPhrase(t, term));
    if (matched) found.push(canonical);
  }

  return found;
}

function isExplicitNoteQuery(text) {
  const explicitNotes = getExplicitRequestedNotes(text);
  if (!explicitNotes.length) return false;

  const tokens = tokensOf(text);
  const hasRequestWord = tokens.some((token) => NOTE_REQUEST_WORDS.has(token));

  // "підбери аромат кавуну" = note search.
  // "Zara Cherry Watermelon Ice" = direct name/reference.
  return hasRequestWord || tokens.length <= 4;
}

function getExactNoteTerms(canonicalNote) {
  return EXACT_NOTE_GROUPS[canonicalNote]?.exact || [];
}

function getFallbackNoteTerms(canonicalNote) {
  return EXACT_NOTE_GROUPS[canonicalNote]?.fallback || [];
}

function parseLocalQuery(userText) {
  const raw = String(userText || "").trim();
  const gender = detectGenderFromQuery(raw);
  const cleanQuery = cleanDirectQuery(raw);
  const aliasedQuery = applyCommonAliases(cleanQuery);

  return {
    raw,
    normalizedRaw: norm(raw),
    gender,
    cleanQuery,
    aliasedQuery,
    isProbablyDirectName: Boolean(cleanQuery && cleanQuery.split(/\s+/).length <= 6),
    explicitNotes: getExplicitRequestedNotes(raw),
    isExplicitNoteQuery: isExplicitNoteQuery(raw),
  };
}

module.exports = {
  parseLocalQuery,
  norm,
  isExplicitNoteQuery,
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
  EXACT_NOTE_GROUPS,
};
