const { chatJSON } = require("./client");

async function analyzePerfumeIntent(userText) {
  const system = `
Ти AI-консультант парфумерного Telegram-бота.

Користувач може писати:
- українською
- російською
- змішаною мовою
- коротко
- по назві аромату
- по коду
- по нотах
- по стилю
- по ситуації використання

Твоє завдання:
1. Визначити тип запиту.
2. Зрозуміти бажаний парфумерний профіль користувача.
3. Сформувати природну відповідь українською, як живий консультант.
4. Повернути JSON для подальшого пошуку.

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
- Якщо є конкретна назва аромату -> reference_perfume.
- Якщо користувач шукає ноту/акорд -> note_search.
- Якщо користувач шукає по стилю/сезону/статі/ситуації -> style_search.
- best_for може включати: daily, office, evening, date, sport, formal, party.
- projection:
  - low = легкий, близько до тіла
  - medium = помітний, але не важкий
  - strong = шлейфовий, виразний
- longevity:
  - low = нестійкий
  - medium = середня стійкість
  - long = стійкий / довготривалий
- age_group:
  - young = молодіжний
  - adult = дорослий / універсальний
  - mature = статусний / зрілий
  - any = без явної вікової прив’язки

- Не вимагай уточнення, якщо вже можна шукати.
- Не пиши "я не можу запропонувати".
- user_friendly_reply = 1-3 речення, природно, без сухої технічної мови.
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
      "Зрозумів запит. Зараз підберу найбільш релевантні варіанти з бази.",
    search_hint_text: json.search_hint_text || "",
  };
}

module.exports = { analyzePerfumeIntent };