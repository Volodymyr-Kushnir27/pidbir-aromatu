const { chatJSON } = require("./client");

async function analyzePerfumeIntent(userText) {
  const system = `
Ти AI-консультант парфумерного Telegram-бота.

Твоє завдання:
1. Визначити тип запиту користувача.
2. Якщо користувач має на увазі конкретний аромат — розпізнати його.
3. Повернути структурований JSON для подальшої логіки.

Можливі query_type:
- "reference_perfume"
- "note_search"
- "style_search"
- "code_search"
- "unknown"

Поверни JSON у форматі:

{
  "found": true,
  "query_type": "reference_perfume|note_search|style_search|code_search|unknown",

  "target_name": "",
  "brand": "",

  "gender": "male|female|unisex|unknown",
  "seasons": [],

  "style": [],
  "notes_top": [],
  "notes_heart": [],
  "notes_base": [],
  "accords": [],

  "search_terms": [],

  "intent_context": {
    "best_for": [],
    "projection": "low|medium|strong|unknown",
    "longevity": "low|medium|long|unknown",
    "age_group": "young|adult|mature|any|unknown",
    "image_style": []
  },

  "user_friendly_reply": "",
  "search_hint_text": ""
}

ПРАВИЛА:
- Якщо запит схожий на код: 60, 377A, 609А -> code_search.
- Якщо є конкретна назва аромату або фраза "схожий на ..." -> reference_perfume.
- Якщо користувач шукає ноту або акорд -> note_search.
- Якщо користувач шукає стиль / стать / сезон / ситуацію -> style_search.
- Користувач може писати українською, російською або змішаною мовою.
- Якщо вже можна шукати — не вважай це unknown.
- user_friendly_reply:
  - для reference_perfume: дуже коротко, 1 речення максимум
  - для інших типів: коротка природна відповідь, що ти зрозумів запит
- Не пиши довгих вступів тут.
`;

  const user = `Запит користувача: ${userText}`;

  const json = await chatJSON({
    system,
    user,
    temperature: 0.3,
  });

  if (!json) {
    return {
      found: false,
      query_type: "unknown",
      target_name: "",
      brand: "",
      gender: "unknown",
      seasons: [],
      style: [],
      notes_top: [],
      notes_heart: [],
      notes_base: [],
      accords: [],
      search_terms: [],
      intent_context: {
        best_for: [],
        projection: "unknown",
        longevity: "unknown",
        age_group: "unknown",
        image_style: [],
      },
      user_friendly_reply:
        "Не до кінця зрозумів запит. Напишіть назву аромату, код, ноти або стиль.",
      search_hint_text: "",
    };
  }

  return {
    found: Boolean(json.found),
    query_type: json.query_type || "unknown",
    target_name: json.target_name || "",
    brand: json.brand || "",
    gender: json.gender || "unknown",
    seasons: Array.isArray(json.seasons) ? json.seasons : [],
    style: Array.isArray(json.style) ? json.style : [],
    notes_top: Array.isArray(json.notes_top) ? json.notes_top : [],
    notes_heart: Array.isArray(json.notes_heart) ? json.notes_heart : [],
    notes_base: Array.isArray(json.notes_base) ? json.notes_base : [],
    accords: Array.isArray(json.accords) ? json.accords : [],
    search_terms: Array.isArray(json.search_terms) ? json.search_terms : [],
    intent_context: {
      best_for: Array.isArray(json.intent_context?.best_for)
        ? json.intent_context.best_for
        : [],
      projection: json.intent_context?.projection || "unknown",
      longevity: json.intent_context?.longevity || "unknown",
      age_group: json.intent_context?.age_group || "unknown",
      image_style: Array.isArray(json.intent_context?.image_style)
        ? json.intent_context.image_style
        : [],
    },
    user_friendly_reply:
      json.user_friendly_reply ||
      "Зрозумів запит. Зараз підберу найбільш релевантні варіанти.",
    search_hint_text: json.search_hint_text || "",
  };
}

module.exports = { analyzePerfumeIntent };