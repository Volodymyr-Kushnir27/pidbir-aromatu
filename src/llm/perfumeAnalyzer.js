const { chatJSON } = require("./client");

async function analyzePerfumeIntent(userText) {
  const system = `
Ти парфумерний AI-консультант для Telegram-бота.

Твоє завдання:
1. Зрозуміти, який аромат має на увазі користувач.
2. Повернути короткий красивий текст українською для Telegram.
3. Повернути структурований JSON-профіль аромату.

Поверни JSON ОБОВ'ЯЗКОВО у такому форматі:

{
  "found": true,
  "query_type": "similar",
  "target_name": "",
  "brand": "",
  "gender": "male|female|unisex|unknown",
  "seasons": ["spring","summer","autumn","winter"],
  "style": ["fresh","aquatic","woody","sweet","citrus","aromatic","spicy","powdery","green"],
  "notes_top": [],
  "notes_heart": [],
  "notes_base": [],
  "accords": [],
  "short_ai_text": "",
  "search_hint_text": ""
}

Правила:
- Якщо аромат не вдалось зрозуміти — found=false.
- short_ai_text = текст для користувача українською, людською мовою.
- search_hint_text = технічний короткий опис аромату для наступного кроку.
- Не вигадуй зайвого. Якщо не знаєш — став порожній масив або "unknown".
`;

  const user = `Запит користувача: ${userText}`;

  const json = await chatJSON({
    system,
    user,
    temperature: 0.2,
  });

  if (!json) {
    return {
      found: false,
      query_type: "similar",
      target_name: "",
      brand: "",
      gender: "unknown",
      seasons: [],
      style: [],
      notes_top: [],
      notes_heart: [],
      notes_base: [],
      accords: [],
      short_ai_text:
        "Не зміг коректно розпізнати аромат. Спробуйте написати точнішу назву.",
      search_hint_text: "",
    };
  }

  return {
    found: Boolean(json.found),
    query_type: json.query_type || "similar",
    target_name: json.target_name || "",
    brand: json.brand || "",
    gender: json.gender || "unknown",
    seasons: Array.isArray(json.seasons) ? json.seasons : [],
    style: Array.isArray(json.style) ? json.style : [],
    notes_top: Array.isArray(json.notes_top) ? json.notes_top : [],
    notes_heart: Array.isArray(json.notes_heart) ? json.notes_heart : [],
    notes_base: Array.isArray(json.notes_base) ? json.notes_base : [],
    accords: Array.isArray(json.accords) ? json.accords : [],
    short_ai_text:
      json.short_ai_text ||
      "Я розібрав аромат і зараз підберу найбільш схожі варіанти.",
    search_hint_text: json.search_hint_text || "",
  };
}

module.exports = { analyzePerfumeIntent };