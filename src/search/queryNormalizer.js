const {
  NOTE_DICTIONARY,
  norm,
  unique,
} = require("./noteDictionary");

const NOTE_REQUEST_WORDS = new Set([
  "нота", "нотою", "ноти", "нотами", "нотка", "ноткою", "акорд", "акордом",
  "note", "notes", "with",
  "аромат", "аромату", "ароматом", "парфум", "парфуми", "парфюм", "духи",
  "підбери", "подбери", "знайди", "найди", "покажи", "хочу", "треба", "мені", "мне",
  "з", "із", "с", "со", "зі", "у", "в",
]);

const GENDER_WORDS = {
  female: ["жіночі", "жіночий", "жіноче", "жіноча", "жінки", "жінок", "женские", "женский", "женская", "female", "women", "woman"],
  male: ["чоловічі", "чоловічий", "чоловіче", "чоловіча", "чоловіка", "чоловіків", "мужские", "мужской", "мужская", "male", "men", "man"],
  unisex: ["унісекс", "унісексові", "унисекс", "unisex"],
};

const INTENT_STOP_WORDS = new Set([
  ...NOTE_REQUEST_WORDS,
  "я", "мене", "моя", "мій", "мої", "себе", "будь", "ласка", "будьласка",
  "схоже", "схожий", "схожа", "похожий", "похожее", "аналог", "аналоги",
  "для", "на", "і", "и", "або", "или", "or", "for", "the", "and",
  ...Object.values(GENDER_WORDS).flat(),
]);

function tokensOf(value) {
  return norm(value)
    .replace(/[ʼ’‘`´']/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsPhrase(haystack, phrase) {
  const h = ` ${norm(haystack).replace(/[ʼ’‘`´']/g, " ").replace(/[^a-zа-яіїє0-9]+/gi, " ").replace(/\s+/g, " ")} `;
  const p = ` ${norm(phrase).replace(/[ʼ’‘`´']/g, " ").replace(/[^a-zа-яіїє0-9]+/gi, " ").replace(/\s+/g, " ")} `;
  return p.trim().length > 1 && h.includes(p);
}

function detectGenderFromQuery(text) {
  const tokens = new Set(tokensOf(text));
  for (const [gender, words] of Object.entries(GENDER_WORDS)) {
    if (words.some((w) => tokens.has(norm(w)))) return gender;
  }
  return null;
}

function applyCommonAliases(value) {
  // Minimal name aliases used by direct search; note aliases live in NOTE_DICTIONARY.
  let s = norm(value);
  const aliases = [
    ["том форд", "tom ford"], ["томфорд", "tom ford"], ["том форт", "tom ford"],
    ["пако карабан", "paco rabanne"], ["пако рабан", "paco rabanne"], ["пако рабане", "paco rabanne"],
    ["інвіктус", "invictus"], ["инвиктус", "invictus"],
    ["крид", "creed"], ["крід", "creed"],
    ["дольче габбана", "dolce gabbana"], ["дольче габана", "dolce gabbana"], ["дольче энд габбана", "dolce gabbana"],
    ["імператриця", "imperatrice"], ["императрица", "imperatrice"], ["l imperatrice", "imperatrice"], ["l'imperatrice", "imperatrice"],
    ["габа парфюм", "hormone gaba"], ["габа парфум", "hormone gaba"], ["гормон париж", "hormone paris"], ["хормон париж", "hormone paris"],
  ].sort((a, b) => norm(b[0]).length - norm(a[0]).length);

  for (const [from, to] of aliases) {
    const source = norm(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = ` ${s} `.replace(new RegExp(`(^|\\s)${source}(?=\\s|$)`, "gi"), `$1${norm(to)}`).trim();
  }
  return norm(s);
}

function cleanDirectQuery(value) {
  const raw = applyCommonAliases(value);
  const tokens = raw.split(/\s+/).filter(Boolean).filter((token) => !INTENT_STOP_WORDS.has(norm(token)));
  return norm(tokens.join(" "));
}

function getExplicitRequestedNotes(text) {
  const t = norm(text);
  const found = [];
  const entries = Object.entries(NOTE_DICTIONARY).sort((a, b) => {
    const alen = Math.max(...(a[1].exact || [""]).map((x) => String(x).length));
    const blen = Math.max(...(b[1].exact || [""]).map((x) => String(x).length));
    return blen - alen;
  });

  for (const [canonical, group] of entries) {
    const matched = (group.exact || []).some((term) => containsPhrase(t, term));
    if (matched) found.push(canonical);
  }

  // De-duplicate overlapping groups: if exact same canonical was added once only.
  return unique(found);
}

function isExplicitNoteQuery(text) {
  const explicitNotes = getExplicitRequestedNotes(text);
  if (!explicitNotes.length) return false;

  const tokens = tokensOf(text);
  const hasRequestWord = tokens.some((token) => NOTE_REQUEST_WORDS.has(token));

  // "аромат з жасмином" / "жасмін" = note search.
  // "Tom Ford Bitter Peach" still may be direct name because has more brand/name context.
  return hasRequestWord || tokens.length <= 3;
}

function getExactNoteTerms(canonicalNote) {
  return NOTE_DICTIONARY[canonicalNote]?.exact || [];
}

function getFallbackNoteTerms(canonicalNote) {
  return NOTE_DICTIONARY[canonicalNote]?.fallback || [];
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
    isProbablyDirectName: Boolean(cleanQuery && cleanQuery.split(/\s+/).length <= 6 && !isExplicitNoteQuery(raw)),
    explicitNotes: getExplicitRequestedNotes(raw),
    isExplicitNoteQuery: isExplicitNoteQuery(raw),
  };
}

module.exports = {
  parseLocalQuery,
  norm,
  tokensOf,
  containsPhrase,
  detectGenderFromQuery,
  applyCommonAliases,
  cleanDirectQuery,
  isExplicitNoteQuery,
  getExplicitRequestedNotes,
  getExactNoteTerms,
  getFallbackNoteTerms,
  NOTE_DICTIONARY,
};
