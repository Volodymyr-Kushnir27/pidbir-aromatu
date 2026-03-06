const { chatJSON } = require("./client");

function compactCandidate(item) {
  return {
    id: item.id,
    name: item.name || "",
    number_code: item.number_code || "",
    category: item.category || "",
    gender: item.gender || "",
    season: item.season || "",
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
  const shortCandidates = (candidates || []).slice(0, 10).map(compactCandidate);

  const system = `
Ти парфумерний AI-консультант, який робить фінальний відбір ароматів із вже знайдених кандидатів.

Твоє завдання:
1. Переглянути запит користувача
2. Переглянути perfume analysis
3. Переглянути search profile
4. Переглянути список кандидатів із БД
5. Вибрати найкращі ${topK} варіанти
6. Для кожного написати коротке, людське пояснення українською

Поверни JSON у форматі:

{
  "selected": [
    {
      "id": 123,
      "why": [
        "..."
      ],
      "assistant_comment": "..."
    }
  ]
}

Правила:
- Обирай саме найрелевантніші варіанти під запит.
- Орієнтуйся на ноти, стиль, стать, сезон, характер, шлейф, свіжість, солодкість.
- Якщо користувач шукає по конкретному аромату, підбирай найближчі за настроєм і звучанням.
- Якщо користувач шукає по ноті чи стилю, підбирай ті, що реально найближчі по профілю.
- why = 2-3 короткі причини списком.
- assistant_comment = 1-2 речення, як жива порада консультанта.
- Не пиши сухо, не використовуй канцелярит.
- Не пиши загальні фрази без змісту.
- Не вигадуй того, чого немає у кандидата.
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