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
  "raw_terms": [],

  "best_for": [],
  "projection": "low|medium|strong|unknown",
  "longevity": "low|medium|long|unknown",
  "age_group": "young|adult|mature|any|unknown",
  "image_style": []
}

Правила:
- Якщо користувач шукає ноту українською або російською, додай англійські відповідники.
- Якщо користувач шукає стиль, додай пов’язані style-tags.
- Якщо є ситуація використання — заповни best_for.
- Якщо є побажання по шлейфу — заповни projection.
- Якщо є побажання по стійкості — заповни longevity.
- Якщо є побажання по образу — заповни image_style.
- Якщо є вік / стиль віку — age_group.
- search-profile має бути максимально корисним для пошуку та rerank.
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
      best_for: [],
      projection: "unknown",
      longevity: "unknown",
      age_group: "unknown",
      image_style: [],
    }
  );
}

module.exports = { buildSearchProfile };