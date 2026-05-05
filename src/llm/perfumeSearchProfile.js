const { chatJSON } = require("./client");

function uniq(arr = []) {
  return [
    ...new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function mergeWebIntoAnalysis(analysis = {}, webPerfumeData = null) {
  if (!webPerfumeData?.found) return analysis || {};

  return {
    ...(analysis || {}),
    brand: webPerfumeData.brand || analysis.brand || "",
    target_name: webPerfumeData.target_name || analysis.target_name || "",
    gender: webPerfumeData.gender || analysis.gender || "unknown",

    seasons: uniq([...(analysis.seasons || []), ...(webPerfumeData.seasons || [])]),
    style: uniq([...(analysis.style || []), ...(webPerfumeData.style || [])]),
    notes_top: uniq([...(analysis.notes_top || []), ...(webPerfumeData.notes_top || [])]),
    notes_heart: uniq([...(analysis.notes_heart || []), ...(webPerfumeData.notes_heart || [])]),
    notes_base: uniq([...(analysis.notes_base || []), ...(webPerfumeData.notes_base || [])]),
    accords: uniq([...(analysis.accords || []), ...(webPerfumeData.accords || [])]),
    search_terms: uniq([
      ...(analysis.search_terms || []),
      ...(webPerfumeData.search_terms || []),
      webPerfumeData.brand,
      webPerfumeData.target_name,
      webPerfumeData.normalized_name,
    ]),
  };
}

async function buildSearchProfile(analysis, webPerfumeData = null) {
  const merged = mergeWebIntoAnalysis(analysis, webPerfumeData);

  const system = `
Ти будуєш search-profile для SQLite бази парфумів.

Головна задача:
перетворити perfume analysis у конкретні пошукові ознаки для БД:
notes_include, notes_prefer, accords, style_tags, raw_terms.

Поверни JSON:
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
- Якщо є webPerfumeData, спирайся на webPerfumeData як на джерело профілю.
- Якщо це reference_perfume, витягни ноти, акорди, стиль і search_terms.
- raw_terms — короткі токени для БД: назви нот, синоніми, переклади, ключові слова.
- Якщо аромат gourmand/dessert/sweet/vanilla/biscuit/caramel/pie, НЕ підбирай водні/морські/озонові як головний напрям, якщо в analysis немає aquatic/marine.
- Якщо є lemon pie / лимонний пиріг, профіль має бути:
  lemon, citrus, vanilla, sugar, biscuit, creamy, gourmand, sweet, dessert.
- Якщо є tobacco / тютюн / табак:
  tobacco, tabac, smoky, warm spicy, amber, woody.
- Якщо є peach / персик:
  peach, fruity, juicy, sweet, floral-fruity.
- Якщо є pepper / перець:
  pepper, spicy, warm spicy, fresh spicy.
- Якщо є alcohol / vodka / rum / whiskey / cognac:
  boozy, alcoholic, rum, whiskey, cognac, warm spicy, amber.
- Не роби fallback на випадковий "свіжий/водний", якщо запит про solodky/gourmand/dessert.

Поверни тільки JSON.
`;

  const user = JSON.stringify(
    {
      analysis: merged,
      webPerfumeData: webPerfumeData || null,
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.05,
  });

  return (
    json || {
      query_type: merged.query_type || "unknown",
      gender: merged.gender || "unknown",
      season: merged.seasons || [],
      notes_include: uniq([
        ...(merged.notes_top || []),
        ...(merged.notes_heart || []),
        ...(merged.notes_base || []),
      ]),
      notes_include_synonyms: [],
      notes_prefer: uniq([...(merged.notes_top || []), ...(merged.notes_heart || [])]),
      notes_prefer_synonyms: [],
      accords: merged.accords || [],
      accord_synonyms: [],
      style_tags: merged.style || [],
      style_synonyms: [],
      exclude_tags: [],
      raw_terms: merged.search_terms || [],
      best_for: merged.intent_context?.best_for || [],
      projection: merged.intent_context?.projection || "unknown",
      longevity: merged.intent_context?.longevity || "unknown",
      age_group: merged.intent_context?.age_group || "unknown",
      image_style: merged.intent_context?.image_style || [],
    }
  );
}

module.exports = { buildSearchProfile, mergeWebIntoAnalysis };
