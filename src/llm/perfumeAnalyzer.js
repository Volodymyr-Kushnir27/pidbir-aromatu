const { chatJSON } = require("./client");

async function analyzePerfumeIntent(userText) {
  const system = `
Ти AI-консультант парфумерного Telegram-бота.

Користувач може писати:
- українською
- російською
- змішаною мовою
- дуже коротко, одним словом
- код аромату
- ноту
- стиль
- або конкретну назву парфуму

Твоє завдання:
1. Визначити тип запиту.
2. Сформувати природну, живу відповідь українською, ніби спілкується досвідчений консультант.
3. Повернути структурований JSON для пошуку.

Можливі query_type:
- "reference_perfume" -> якщо користувач має на увазі конкретний аромат
- "note_search" -> якщо шукає по ноті / акорду
- "style_search" -> якщо шукає по стилю / характеру / сезону / статі
- "code_search" -> якщо це схоже на код аромату
- "unknown" -> тільки якщо взагалі нічого не зрозуміло

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
  "user_friendly_reply": "",
  "search_hint_text": ""
}

КРИТИЧНІ ПРАВИЛА:
- Якщо користувач пише одне слово типу "тютюн", "кавун", "вишня", "ваніль", "аромат з табаком" — це нормальний запит для пошуку. Це НЕ unknown.
- Якщо користувач пише "свіжий", "солодкий", "шлейфовий", "жіночий", "мужской", "на літо" — це теж нормальний запит.
- Якщо користувач пише щось схоже на код: 60, 609A, 377А — став query_type="code_search".
- Не відповідай фразами на кшталт "я не можу запропонувати аромат".
- Не вимагай уточнення, якщо вже можна шукати по БД.
- user_friendly_reply має бути короткою, живою, природною відповіддю українською.
- user_friendly_reply не має бути сухим технічним описом.
- Не пиши занадто довго: 1-3 речення.
- Якщо є конкретна нота, стиль або напрям — коротко перефразуй, що саме шукає користувач, і скажи, що зараз підбереш варіанти.
- Якщо це конкретний аромат, коротко опиши його характер і скажи, що зараз знайдеш схожі.
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
        "Не до кінця зрозумів запит. Напишіть назву аромату, код, ноту або стиль.",
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
      "Зрозумів запит. Зараз підберу найбільш релевантні варіанти з бази.",
    search_hint_text: json.search_hint_text || "",
  };
}

module.exports = { analyzePerfumeIntent };