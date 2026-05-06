const {
  cleanDirectQuery,
  applyCommonAliases,
  detectGenderFromQuery,
} = require("./directNameKeywordSearch");
const {
  NOTE_DICTIONARY,
  norm,
  normalizePhrase,
  containsPhrase,
  detectNotesInText,
  getNoteTerms,
} = require("./noteDictionary");

const NOTE_REQUEST_WORDS = new Set([
  "нота", "нотою", "ноти", "нотами", "note", "notes",
  "з", "із", "со", "с", "with",
  "аромат", "аромату", "аромати", "парфум", "парфуми", "духи",
  "підбери", "подбери", "знайди", "найди", "покажи", "хочу", "треба", "мені", "мне",
  "запах", "запахом", "пахне", "пахнуть",
]);

const STYLE_WORDS = new Set([
  "шлейф", "шлейфовий", "шлейфова", "шлейфові",
  "стійкий", "стійка", "стійкі", "стойкий", "стойкие",
  "свіжий", "свіжа", "свіжі", "свежий", "fresh",
  "солодкий", "солодка", "солодкі", "сладкий", "sweet",
  "фруктовий", "фруктова", "фруктові", "fruity",
  "квітковий", "квіткова", "квіткові", "цветочный", "floral",
  "деревний", "деревні", "woody",
  "східний", "східні", "oriental",
  "пряний", "пряні", "spicy",
  "теплий", "теплі", "warm",
  "ніжний", "ніжні", "легкий", "легкі",
  "літній", "весняний", "зимовий", "осінній",
]);

function tokensOf(value) {
  return normalizePhrase(value)
    .split(/\s+/)
    .filter(Boolean);
}

function getExplicitRequestedNotes(text) {
  return detectNotesInText(text).map((x) => x.canonical);
}

function getExplicitRequestedNoteDetails(text) {
  return detectNotesInText(text);
}

function isExplicitNoteQuery(text) {
  const notes = getExplicitRequestedNotes(text);
  if (!notes.length) return false;

  const tokens = tokensOf(text);
  const hasRequestWord = tokens.some((token) => NOTE_REQUEST_WORDS.has(token));
  const hasStyleWord = tokens.some((token) => STYLE_WORDS.has(token));

  // Short one-note queries: "слива", "мед", "фіалка", "ром".
  if (tokens.length <= 4) return true;

  // "шлейфовий парфум з вишнею", "парфуми з запахом рому".
  if (hasRequestWord || hasStyleWord) return true;

  return false;
}

function getExactNoteTerms(canonicalNote) {
  return getNoteTerms(canonicalNote);
}

function getFallbackNoteTerms() {
  // Універсальний режим: fallback по напряму не змішуємо з exact-note.
  // Якщо exact-note не дала результатів, основний flow може йти в AI/profile.
  return [];
}

function extractStyleTerms(text) {
  const tokens = tokensOf(text);
  return tokens.filter((token) => STYLE_WORDS.has(token));
}

function parseLocalQuery(userText) {
  const raw = String(userText || "").trim();
  const gender = detectGenderFromQuery(raw);
  const cleanQuery = cleanDirectQuery(raw);
  const aliasedQuery = applyCommonAliases(cleanQuery);
  const noteDetails = getExplicitRequestedNoteDetails(raw);

  return {
    raw,
    normalizedRaw: norm(raw),
    gender,
    cleanQuery,
    aliasedQuery,
    isProbablyDirectName: Boolean(cleanQuery && cleanQuery.split(/\s+/).length <= 6),
    explicitNotes: noteDetails.map((x) => x.canonical),
    explicitNoteDetails: noteDetails,
    isExplicitNoteQuery: isExplicitNoteQuery(raw),
    styleTerms: extractStyleTerms(raw),
  };
}

module.exports = {
  parseLocalQuery,
  norm,
  normalizePhrase,
  containsPhrase,
  isExplicitNoteQuery,
  getExplicitRequestedNotes,
  getExplicitRequestedNoteDetails,
  getExactNoteTerms,
  getFallbackNoteTerms,
  extractStyleTerms,
  NOTE_DICTIONARY,
};
