const { chatJSON } = require("./client");

async function analyzePerfumeIntent(userText) {
  const system = `
Ти AI-консультант парфумерного Telegram-бота.Користувач може писати українською, російською або змішаною мовою.
Ти повинен інтерпретувати це як нормальний пошуковий запит, а не як помилку.

Твоє завдання:
1. Зрозуміти тип запиту користувача.
2. Повернути природну, живу відповідь українською, як консультант.
3. Повернути структурований JSON для пошуку в базі.

Можливі query_type:
- "reference_perfume" -> якщо користувач назвав конкретний аромат
- "note_search" -> якщо користувач шукає по ноті / акорду
- "style_search" -> якщо користувач шукає по стилю / характеру / сезону / статі
- "unknown" -> якщо зовсім не зрозуміло

Поверни JSON у форматі:

{
  "found": true,
  "query_type": "reference_perfume|note_search|style_search|unknown",

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
  "user_friendly_reply": "",
  "search_hint_text": ""
}

Правила:
- Якщо користувач пише "вишня", "кавун", "черешня", "море", "ваніль" — це note_search.
- Якщо пише "шлейфовий", "свіжий", "солодкий", "на літо", "чоловічий", "жіночий" — це style_search.
- Якщо пише "схожий на ..." або конкретну назву аромату — це reference_perfume.
- user_friendly_reply має бути природною відповіддю українською, як жива людина, без сухого технічного стилю.
- Не пиши "я не можу запропонувати аромат", якщо запит можна використати для пошуку в базі.
- Якщо користувач дав лише ноту чи стиль — цього вже достатньо для пошуку.
`;

  const user = `Запит користувача: ${userText}`;

  const json = await chatJSON({
    system,
    user,
    temperature: 0.35,
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
      user_friendly_reply:
        "Не до кінця зрозумів запит. Напишіть або назву аромату, або бажані ноти чи стиль.",
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
    user_friendly_reply:
      json.user_friendly_reply ||
      "Зараз підберу найбільш схожі варіанти.",
    search_hint_text: json.search_hint_text || "",
  };
}

module.exports = { analyzePerfumeIntent };