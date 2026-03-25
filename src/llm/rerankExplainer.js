const { chatJSON } = require("./client");

function compactCandidate(item) {
  return {
    id: item.id,
    name: item.name || "",
    number_code: item.number_code || "",
    category: item.category || "",
    gender: item.gender || "",
    season: item.season || "",
    occasion: item.occasion || "",
    age: item.age || "",
    notes: item.notes || "",
    accords: item.accords || "",
    description: item.description || "",
    short_desc: item.short_desc || "",
    keywords: item.keywords || "",
    match_score: item.match_score || 0,
    debug: item._debug || {},
  };
}

async function rerankAndExplain({
  userText,
  analysis,
  searchProfile,
  candidates,
  topK = 3,
}) {
  const shortCandidates = (candidates || []).slice(0, 6).map(compactCandidate);

  const system = `
Ти парфумерний AI-консультант, який робить фінальний відбір ароматів із уже знайдених кандидатів.

Твоє завдання:
1. Переглянути запит користувача
2. Переглянути perfume analysis
3. Переглянути search profile
4. Переглянути список кандидатів із БД
5. Вибрати найкращі ${topK} варіанти
6. Для кожного написати людські пояснення українською

Поверни JSON у форматі:

{
  "selected": [
    {
      "id": 123,
      "why": [
        "..."
      ],
      "assistant_comment": "...",
      "match_type": "close_match|style_match|note_match|occasion_match",
      "confidence": 0.0,
      "best_for": [],
      "projection_fit": "low|medium|strong|unknown",
      "longevity_fit": "low|medium|long|unknown"
    }
  ]
}

Правила:
- Орієнтуйся не тільки на ноти й стиль, а й на:
  - best_for: daily / office / evening / date / sport / formal / party
  - projection: low / medium / strong
  - longevity: low / medium / long
  - season
  - age_group
  - image_style
- Якщо користувач просить офісний аромат — віддавай більш стримані кандидати.
- Якщо просить вечірній / побачення — допускай більш щільні, шлейфові, чуттєві варіанти.
- Якщо просить шлейф — higher priority strong projection.
- Якщо просить стійкість — higher priority long longevity.
- why = 2-3 короткі, конкретні, людські причини українською.
- Кожна причина має звучати як порада консультанта, а не як технічний тег.
- Не пиши шаблони типу "загалом хороший аромат", "підходить під запит", "цікавий варіант".
- Краще пиши на кшталт:
  - "є соковитий цитрусовий старт, який добре відповідає вашому запиту"
  - "у базі є мускусно-амброксановий шлейф, тому аромат звучить чисто й сучасно"
  - "за характером він близький до денного, легкого і компліментарного профілю"
- assistant_comment = 1-2 речення як жива порада консультанта.
- confidence = число від 0 до 1.
- Не вигадуй того, чого немає в даних кандидата.
- Уникай пустих фраз типу "загалом хороший аромат".
`;

  const user = JSON.stringify(
    {
      userText,
      analysis,
      searchProfile,
      candidates: shortCandidates,
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.35,
  });

  if (!json || !Array.isArray(json.selected)) {
    return null;
  }

  return json.selected;
}

module.exports = { rerankAndExplain };