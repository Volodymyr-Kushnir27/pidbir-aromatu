const { chatJSON } = require("./client");

async function buildSearchProfile(analysis) {
  const system = `
Ти будуєш search-profile для SQLite бази парфумів.

Поверни JSON у форматі:

{
  "query_type": "reference_perfume|note_search|style_search|unknown",
  "gender": "male|female|unisex|unknown",
  "season": [],

  "notes_include": [],
  "notes_include_synonyms": [],

  "notes_prefer": [],
  "notes_prefer_synonyms": [],

  "accords": [],
  "accord_synonyms": [],

  "style_tags": [],
  "style_synonyms": [],

  "exclude_tags": [],
  "raw_terms": []
}

Правила:
- Якщо користувач пише українською або російською, додай і англійські відповідники.
- Якщо користувач пише "кавун" або "арбуз" -> додай "watermelon".
- Якщо користувач пише "вишня" / "черешня" / "вишнёвый" -> додай "cherry".
- Якщо користувач пише "морський" / "морской" -> додай "marine", "aquatic", "ozonic".
- Якщо користувач пише "шлейфовий" / "шлейфовый" -> додай "projection", "sillage", "long lasting".
- Якщо користувач пише "свіжий" / "свежий" -> додай "fresh", "clean".
- Якщо користувач пише "солодкий" / "сладкий" -> додай "sweet", "gourmand".
- Профіль має бути корисним саме для пошуку в БД.
`;

  const user = `Ось perfume analysis:\n${JSON.stringify(analysis, null, 2)}`;

  const json = await chatJSON({
    system,
    user,
    temperature: 0.2,
  });

  return (
    json || {
      query_type: "unknown",
      gender: "unknown",
      season: [],
      notes_include: [],
      notes_include_synonyms: [],
      notes_prefer: [],
      notes_prefer_synonyms: [],
      accords: [],
      accord_synonyms: [],
      style_tags: [],
      style_synonyms: [],
      exclude_tags: [],
      raw_terms: [],
    }
  );
}

module.exports = { buildSearchProfile };